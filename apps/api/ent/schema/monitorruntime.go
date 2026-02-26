package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// MonitorRuntime holds mutable state for each monitor.
type MonitorRuntime struct {
	ent.Schema
}

// Fields of the MonitorRuntime.
func (MonitorRuntime) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("status").
			Values("pending", "ok", "error", "retrying", "disabled").
			Default("pending"),
		field.Int64("check_count").
			Default(0),
		field.Int64("success_count").
			Default(0),
		field.Int64("error_count").
			Default(0),
		field.Int64("retry_count").
			Default(0),
		field.Int64("consecutive_successes").
			Default(0),
		field.Int64("consecutive_errors").
			Default(0),
		field.Time("last_check_at").
			Optional().
			Nillable(),
		field.Time("last_success_at").
			Optional().
			Nillable(),
		field.Time("last_error_at").
			Optional().
			Nillable(),
		field.Int("last_status_code").
			Optional().
			Nillable(),
		field.Int("last_duration_ms").
			Optional().
			Nillable(),
		field.String("last_error_message").
			Optional().
			Nillable(),
		field.Time("next_run_at").
			Optional().
			Nillable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Edges of the MonitorRuntime.
func (MonitorRuntime) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("monitor", Monitor.Type).
			Ref("runtime").
			Unique().
			Required(),
	}
}
