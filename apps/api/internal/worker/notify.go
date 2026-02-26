package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"goanna/apps/api/ent"
	"goanna/apps/api/ent/notificationchannel"

	"github.com/go-telegram/bot"
)

const telegramSendTimeout = 10 * time.Second

func (w *Worker) notifyMonitorDiff(ctx context.Context, row *ent.Monitor, diff *selectionDiff, checkedAt time.Time) error {
	if diff == nil || !diff.Changed {
		return nil
	}

	channels, err := w.enabledChannelsForMonitor(ctx, row)
	if err != nil {
		return err
	}
	if len(channels) == 0 {
		return nil
	}

	message := formatMonitorDiffMessage(row, diff, checkedAt)
	var notifyErr error
	for _, channel := range channels {
		status := "sent"
		eventMessage := diff.Summary

		if err := w.sendMonitorDiffToChannel(ctx, channel, message); err != nil {
			status = "error"
			eventMessage = err.Error()
			notifyErr = err
		}

		eventCreate := w.db.NotificationEvent.Create().
			SetMonitorID(row.ID).
			SetChannelID(channel.ID).
			SetStatus(status).
			SetMessage(eventMessage).
			SetSentAt(checkedAt)
		if _, err := eventCreate.Save(ctx); err != nil {
			notifyErr = err
		}
	}

	return notifyErr
}

func (w *Worker) enabledChannelsForMonitor(ctx context.Context, row *ent.Monitor) ([]*ent.NotificationChannel, error) {
	channels, err := w.db.NotificationChannel.Query().
		Where(notificationchannel.EnabledEQ(true)).
		All(ctx)
	if err != nil {
		return nil, err
	}

	if len(row.NotificationChannels) == 0 {
		return []*ent.NotificationChannel{}, nil
	}

	allowedKinds := make(map[string]struct{}, len(row.NotificationChannels))
	for _, rawKind := range row.NotificationChannels {
		kind := strings.ToLower(strings.TrimSpace(rawKind))
		if kind == "" {
			continue
		}
		allowedKinds[kind] = struct{}{}
	}

	filtered := make([]*ent.NotificationChannel, 0, len(channels))
	for _, channel := range channels {
		kind := strings.ToLower(channel.Kind.String())
		if _, ok := allowedKinds[kind]; ok {
			filtered = append(filtered, channel)
		}
	}

	return filtered, nil
}

func (w *Worker) sendMonitorDiffToChannel(ctx context.Context, channel *ent.NotificationChannel, message string) error {
	switch channel.Kind {
	case notificationchannel.KindTelegram:
		return w.sendTelegramMessage(ctx, channel.BotToken, channel.ChatID, message)
	default:
		return fmt.Errorf("unsupported notification channel kind %q", channel.Kind)
	}
}

func (w *Worker) sendTelegramMessage(ctx context.Context, botToken string, chatID string, message string) error {
	sendCtx, cancel := context.WithTimeout(ctx, telegramSendTimeout)
	defer cancel()

	client, err := bot.New(botToken, bot.WithSkipGetMe())
	if err != nil {
		return err
	}

	_, err = client.SendMessage(sendCtx, &bot.SendMessageParams{
		ChatID: chatID,
		Text:   message,
	})
	return err
}

func formatMonitorDiffMessage(row *ent.Monitor, diff *selectionDiff, checkedAt time.Time) string {
	monitorLine := fmt.Sprintf("Monitor: %d", row.ID)
	if monitorLabel := monitorNotificationLabel(row); monitorLabel != "" {
		monitorLine = fmt.Sprintf("Monitor: %s (#%d)", monitorLabel, row.ID)
	}

	lines := []string{
		"Goanna diff detected",
		monitorLine,
		fmt.Sprintf("URL: %s", row.URL),
		fmt.Sprintf("CheckedAt (UTC): %s", checkedAt.UTC().Format(time.RFC3339)),
		fmt.Sprintf("Kind: %s", diff.Kind),
		fmt.Sprintf("Summary: %s", diff.Summary),
	}

	if detail := formatNotificationDetail(diff); detail != "" {
		lines = append(lines, detail)
	}

	return strings.Join(lines, "\n")
}

func monitorNotificationLabel(row *ent.Monitor) string {
	if row == nil || row.Label == nil {
		return ""
	}

	return strings.TrimSpace(*row.Label)
}

func formatNotificationDetail(diff *selectionDiff) string {
	if diff == nil || len(diff.Details) == 0 {
		return ""
	}

	switch diff.Kind {
	case "text", "dateTime", "typeChanged":
		oldValue, _ := diff.Details["old"].(string)
		newValue, _ := diff.Details["new"].(string)
		if oldValue == "" && newValue == "" {
			return ""
		}
		return fmt.Sprintf("Old: %s\nNew: %s", truncateNotificationValue(oldValue), truncateNotificationValue(newValue))
	case "number":
		return fmt.Sprintf("Details: old=%v new=%v delta=%v", diff.Details["old"], diff.Details["new"], diff.Details["delta"])
	case "array":
		if detail := formatPrimitiveArrayNotificationDetail(diff.Details); detail != "" {
			return detail
		}
		return formatNotificationJSONDetails(diff.Details)
	case "arrayObject":
		if detail := formatArrayObjectNotificationDetail(diff.Details); detail != "" {
			return detail
		}
		return formatNotificationJSONDetails(diff.Details)
	case "arrayReorder":
		if oldCount, oldOK := diff.Details["oldCount"]; oldOK {
			if newCount, newOK := diff.Details["newCount"]; newOK {
				return fmt.Sprintf("Order changed (%v -> %v items)", oldCount, newCount)
			}
		}
		return formatNotificationJSONDetails(diff.Details)
	case "object":
		return formatNotificationJSONDetails(diff.Details)
	default:
		return ""
	}
}

func formatPrimitiveArrayNotificationDetail(details map[string]any) string {
	lines := make([]string, 0, 2)
	if added := formatPrimitiveCountMapForNotification(details["added"]); added != "" {
		lines = append(lines, fmt.Sprintf("Added: %s", added))
	}
	if removed := formatPrimitiveCountMapForNotification(details["removed"]); removed != "" {
		lines = append(lines, fmt.Sprintf("Removed: %s", removed))
	}

	return strings.Join(lines, "\n")
}

func formatArrayObjectNotificationDetail(details map[string]any) string {
	keyField, _ := details["keyField"].(string)
	if strings.TrimSpace(keyField) == "" {
		keyField = "key"
	}

	lines := make([]string, 0, 3)
	if added := formatStringSliceForNotification(details["added"]); added != "" {
		lines = append(lines, fmt.Sprintf("Added by %s: %s", keyField, added))
	}
	if removed := formatStringSliceForNotification(details["removed"]); removed != "" {
		lines = append(lines, fmt.Sprintf("Removed by %s: %s", keyField, removed))
	}
	if updated := formatStringSliceForNotification(details["updated"]); updated != "" {
		lines = append(lines, fmt.Sprintf("Updated by %s: %s", keyField, updated))
	}

	return strings.Join(lines, "\n")
}

func formatStringSliceForNotification(value any) string {
	values, ok := value.([]string)
	if !ok || len(values) == 0 {
		return ""
	}

	decoded := make([]string, 0, len(values))
	for _, raw := range values {
		decoded = append(decoded, decodeNotificationPrimitiveValue(raw))
	}
	return strings.Join(decoded, ", ")
}

func formatPrimitiveCountMapForNotification(value any) string {
	counts, ok := value.(map[string]int)
	if !ok || len(counts) == 0 {
		return ""
	}

	type entry struct {
		value string
		count int
	}

	entries := make([]entry, 0, len(counts))
	for rawValue, count := range counts {
		entries = append(entries, entry{
			value: decodeNotificationPrimitiveValue(rawValue),
			count: count,
		})
	}

	sort.Slice(entries, func(left int, right int) bool {
		return entries[left].value < entries[right].value
	})

	parts := make([]string, 0, len(entries))
	for _, item := range entries {
		parts = append(parts, fmt.Sprintf("%s (x%d)", item.value, item.count))
	}

	return strings.Join(parts, ", ")
}

func decodeNotificationPrimitiveValue(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return raw
	}

	var parsed any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return raw
	}

	if parsed == nil {
		return "null"
	}

	if asString, ok := parsed.(string); ok {
		return asString
	}

	return fmt.Sprintf("%v", parsed)
}

func formatNotificationJSONDetails(details map[string]any) string {
	filteredDetails := compactNotificationDetails(details)
	if len(filteredDetails) == 0 {
		return ""
	}

	encoded, err := json.MarshalIndent(filteredDetails, "", "  ")
	if err != nil {
		return ""
	}
	return fmt.Sprintf("Details: %s", truncateNotificationValue(string(encoded)))
}

func compactNotificationDetails(details map[string]any) map[string]any {
	if len(details) == 0 {
		return map[string]any{}
	}

	filtered := make(map[string]any, len(details))
	for key, value := range details {
		if shouldOmitNotificationDetailValue(value) {
			continue
		}
		filtered[key] = value
	}

	return filtered
}

func shouldOmitNotificationDetailValue(value any) bool {
	if value == nil {
		return true
	}

	rawValue := reflect.ValueOf(value)
	switch rawValue.Kind() {
	case reflect.Array, reflect.Map, reflect.Slice:
		return rawValue.Len() == 0
	default:
		return false
	}
}

func truncateNotificationValue(value string) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= 240 {
		return trimmed
	}
	return trimmed[:240] + "..."
}
