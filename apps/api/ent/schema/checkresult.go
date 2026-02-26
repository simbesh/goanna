package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// CheckResult holds the schema definition for the CheckResult entity.
type CheckResult struct {
	ent.Schema
}

// Fields of the CheckResult.
func (CheckResult) Fields() []ent.Field {
	return []ent.Field{
		field.String("status").
			Default("unknown"),
		field.Int("status_code").
			Optional().
			Nillable(),
		field.Int("response_time_ms").
			Optional().
			Nillable(),
		field.String("error_message").
			Optional().
			Nillable(),
		field.String("selection_type").
			Optional().
			Nillable(),
		field.String("selection_value").
			Optional().
			Nillable(),
		field.Bool("diff_changed").
			Default(false),
		field.String("diff_kind").
			Optional().
			Nillable(),
		field.String("diff_summary").
			Optional().
			Nillable(),
		field.String("diff_details").
			Optional().
			Nillable(),
		field.Time("checked_at").
			Default(time.Now),
	}
}

// Edges of the CheckResult.
func (CheckResult) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("monitor", Monitor.Type).
			Ref("check_results").
			Unique().
			Required(),
	}
}
