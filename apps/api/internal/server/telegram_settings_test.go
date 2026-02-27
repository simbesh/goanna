package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"goanna/apps/api/ent/enttest"
	"goanna/apps/api/ent/notificationchannel"

	_ "github.com/mattn/go-sqlite3"
)

func TestShouldClearTelegramChannel(t *testing.T) {
	tests := []struct {
		name         string
		enabled      bool
		botToken     string
		chatID       string
		wantClear    bool
		wantErr      bool
		wantErrValue string
	}{
		{
			name:      "clear when disabled and both empty",
			enabled:   false,
			botToken:  "",
			chatID:    "",
			wantClear: true,
		},
		{
			name:         "reject empty values when enabled",
			enabled:      true,
			botToken:     "",
			chatID:       "",
			wantErr:      true,
			wantErrValue: "botToken and chatId are required when channel is enabled",
		},
		{
			name:         "reject partial credentials",
			enabled:      false,
			botToken:     "token",
			chatID:       "",
			wantErr:      true,
			wantErrValue: "botToken and chatId must both be provided or both be empty",
		},
		{
			name:      "keep when credentials provided and disabled",
			enabled:   false,
			botToken:  "token",
			chatID:    "chat",
			wantClear: false,
		},
		{
			name:      "keep when credentials provided and enabled",
			enabled:   true,
			botToken:  "token",
			chatID:    "chat",
			wantClear: false,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			clearChannel, err := shouldClearTelegramChannel(
				testCase.enabled,
				testCase.botToken,
				testCase.chatID,
			)

			if testCase.wantErr {
				if err == nil {
					t.Fatalf("expected error %q", testCase.wantErrValue)
				}
				if err.Error() != testCase.wantErrValue {
					t.Fatalf("expected error %q, got %q", testCase.wantErrValue, err.Error())
				}
				return
			}

			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if clearChannel != testCase.wantClear {
				t.Fatalf("expected clear=%t, got %t", testCase.wantClear, clearChannel)
			}
		})
	}
}

func TestHandleUpsertTelegramSettingsClearsStoredCredentials(t *testing.T) {
	client := enttest.Open(t, "sqlite3", "file:telegram-clear-settings?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	_, err := client.NotificationChannel.Create().
		SetName("Telegram").
		SetKind("telegram").
		SetBotToken("token").
		SetChatID("chat").
		SetEnabled(true).
		Save(t.Context())
	if err != nil {
		t.Fatalf("expected seeded telegram channel, got %v", err)
	}

	server := New(client)
	req := httptest.NewRequest(
		http.MethodPut,
		"/v1/settings/notifications/telegram",
		strings.NewReader(`{"enabled":false,"botToken":"","chatId":""}`),
	)
	recorder := httptest.NewRecorder()

	server.handleUpsertTelegramSettings(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	var response telegramSettingsResponse
	if decodeErr := json.NewDecoder(recorder.Body).Decode(&response); decodeErr != nil {
		t.Fatalf("expected JSON response, got %v", decodeErr)
	}
	if response.Enabled {
		t.Fatal("expected channel to be disabled after clearing")
	}
	if response.BotToken != "" || response.ChatID != "" {
		t.Fatalf("expected empty credentials after clearing, got token=%q chatId=%q", response.BotToken, response.ChatID)
	}

	exists, err := client.NotificationChannel.Query().Where(notificationchannel.KindEQ("telegram")).Exist(t.Context())
	if err != nil {
		t.Fatalf("expected channel existence query to succeed, got %v", err)
	}
	if exists {
		t.Fatal("expected telegram channel row to be deleted after clearing credentials")
	}
}

func TestHandleUpsertTelegramSettingsRejectsClearingWhenEnabled(t *testing.T) {
	client := enttest.Open(t, "sqlite3", "file:telegram-clear-reject?mode=memory&cache=shared&_fk=1")
	defer client.Close()

	server := New(client)
	req := httptest.NewRequest(
		http.MethodPut,
		"/v1/settings/notifications/telegram",
		strings.NewReader(`{"enabled":true,"botToken":"","chatId":""}`),
	)
	recorder := httptest.NewRecorder()

	server.handleUpsertTelegramSettings(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", recorder.Code)
	}
}
