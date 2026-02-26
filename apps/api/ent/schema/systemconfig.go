package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// SystemConfig stores global runtime knobs.
type SystemConfig struct {
	ent.Schema
}

// Fields of the SystemConfig.
func (SystemConfig) Fields() []ent.Field {
	return []ent.Field{
		field.String("key").
			Default("global"),
		field.Int("checks_history_limit").
			Positive().
			Default(200),
		field.String("timezone").
			Optional().
			Nillable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

// Indexes of the SystemConfig.
func (SystemConfig) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("key").Unique(),
	}
}
