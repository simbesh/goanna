package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// NotificationChannel holds the schema definition for the NotificationChannel entity.
type NotificationChannel struct {
	ent.Schema
}

// Fields of the NotificationChannel.
func (NotificationChannel) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			Default("Telegram"),
		field.Enum("kind").
			Values("telegram").
			Default("telegram"),
		field.String("bot_token").
			NotEmpty(),
		field.String("chat_id").
			NotEmpty(),
		field.Bool("enabled").
			Default(true),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Indexes of the NotificationChannel.
func (NotificationChannel) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("kind").Unique(),
	}
}

// Edges of the NotificationChannel.
func (NotificationChannel) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("notification_events", NotificationEvent.Type),
	}
}
