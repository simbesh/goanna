package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Endpoint holds the schema definition for the Endpoint entity.
type Endpoint struct {
	ent.Schema
}

// Fields of the Endpoint.
func (Endpoint) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty().
			Unique(),
		field.String("url").
			NotEmpty(),
		field.String("method").
			Default("GET"),
		field.Int("interval_seconds").
			Positive().
			Default(60),
		field.Int("timeout_seconds").
			Positive().
			Default(10),
		field.Int("expected_status").
			Positive().
			Default(200),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the Endpoint.
func (Endpoint) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("check_results", CheckResult.Type),
		edge.To("notification_events", NotificationEvent.Type),
	}
}
