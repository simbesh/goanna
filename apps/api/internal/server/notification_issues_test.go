package server

import (
	"testing"

	"goanna/apps/api/ent"
	"goanna/apps/api/ent/notificationchannel"
)

func TestBuildMonitorNotificationIssuesWhenChannelNotConfigured(t *testing.T) {
	issues := buildMonitorNotificationIssues([]string{"telegram"}, map[string]notificationChannelState{})

	if len(issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(issues))
	}
	if issues[0].Code != "channel_not_configured" {
		t.Fatalf("expected channel_not_configured, got %q", issues[0].Code)
	}
	if issues[0].Channel != "telegram" {
		t.Fatalf("expected telegram channel, got %q", issues[0].Channel)
	}
}

func TestBuildMonitorNotificationIssuesWhenChannelDisabled(t *testing.T) {
	issues := buildMonitorNotificationIssues(
		[]string{"telegram"},
		map[string]notificationChannelState{
			"telegram": {
				enabled:               false,
				credentialsConfigured: true,
			},
		},
	)

	if len(issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(issues))
	}
	if issues[0].Code != "channel_disabled" {
		t.Fatalf("expected channel_disabled, got %q", issues[0].Code)
	}
}

func TestBuildMonitorNotificationIssuesWhenCredentialsMissing(t *testing.T) {
	issues := buildMonitorNotificationIssues(
		[]string{"telegram"},
		map[string]notificationChannelState{
			"telegram": {
				enabled:               true,
				credentialsConfigured: false,
			},
		},
	)

	if len(issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(issues))
	}
	if issues[0].Code != "channel_credentials_missing" {
		t.Fatalf("expected channel_credentials_missing, got %q", issues[0].Code)
	}
}

func TestBuildMonitorNotificationIssuesSkipsHealthyAndDuplicateChannels(t *testing.T) {
	issues := buildMonitorNotificationIssues(
		[]string{" telegram ", "telegram", ""},
		map[string]notificationChannelState{
			"telegram": {
				enabled:               true,
				credentialsConfigured: true,
			},
		},
	)

	if len(issues) != 0 {
		t.Fatalf("expected no issues, got %#v", issues)
	}
}

func TestNotificationChannelHasConfiguredCredentialsForTelegram(t *testing.T) {
	configured := notificationChannelHasConfiguredCredentials(&ent.NotificationChannel{
		Kind:     notificationchannel.KindTelegram,
		BotToken: "token",
		ChatID:   "chat",
	})
	if !configured {
		t.Fatal("expected telegram credentials to be treated as configured")
	}

	missingBotToken := notificationChannelHasConfiguredCredentials(&ent.NotificationChannel{
		Kind:     notificationchannel.KindTelegram,
		BotToken: "",
		ChatID:   "chat",
	})
	if missingBotToken {
		t.Fatal("expected missing bot token to be treated as unconfigured")
	}
}

func TestNotificationChannelHasConfiguredCredentialsAllowsUnknownKinds(t *testing.T) {
	configured := notificationChannelHasConfiguredCredentials(&ent.NotificationChannel{
		Kind: notificationchannel.Kind("email"),
	})
	if !configured {
		t.Fatal("expected unknown channel kinds to be treated as configured")
	}
}
