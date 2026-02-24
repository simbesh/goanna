package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// NotificationChannel holds the schema definition for the NotificationChannel entity.
type NotificationChannel struct {
	ent.Schema
}

// Fields of the NotificationChannel.
func (NotificationChannel) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty().
			Unique(),
		field.String("kind").
			NotEmpty(),
		field.String("target").
			NotEmpty(),
		field.Bool("enabled").
			Default(true),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

// Edges of the NotificationChannel.
func (NotificationChannel) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("notification_events", NotificationEvent.Type),
	}
}
