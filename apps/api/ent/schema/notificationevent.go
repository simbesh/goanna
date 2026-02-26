package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// NotificationEvent holds the schema definition for the NotificationEvent entity.
type NotificationEvent struct {
	ent.Schema
}

// Fields of the NotificationEvent.
func (NotificationEvent) Fields() []ent.Field {
	return []ent.Field{
		field.String("status").
			Default("pending"),
		field.String("message").
			Optional().
			Nillable(),
		field.Time("sent_at").
			Default(time.Now),
	}
}

// Edges of the NotificationEvent.
func (NotificationEvent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("monitor", Monitor.Type).
			Ref("notification_events").
			Unique().
			Required(),
		edge.From("channel", NotificationChannel.Type).
			Ref("notification_events").
			Unique().
			Required(),
	}
}
