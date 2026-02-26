package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Monitor holds the schema definition for the Monitor entity.
type Monitor struct {
	ent.Schema
}

// Fields of the Monitor.
func (Monitor) Fields() []ent.Field {
	return []ent.Field{
		field.String("label").
			Optional().
			Nillable(),
		field.String("method").
			Default("GET"),
		field.String("url").
			NotEmpty(),
		field.String("icon_url").
			Optional().
			Nillable(),
		field.String("body").
			Optional().
			Nillable(),
		field.JSON("headers", map[string]string{}).
			Optional(),
		field.JSON("auth", map[string]string{}).
			Optional(),
		field.JSON("notification_channels", []string{}).
			Optional(),
		field.String("selector").
			Optional().
			Nillable(),
		field.Enum("expected_type").
			Values("json", "html", "text").
			Default("json"),
		field.String("expected_response").
			Optional().
			Nillable(),
		field.String("cron").
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

// Edges of the Monitor.
func (Monitor) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("check_results", CheckResult.Type),
		edge.To("notification_events", NotificationEvent.Type),
		edge.To("runtime", MonitorRuntime.Type).
			Unique(),
	}
}
