CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"sf_contact_id" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"title" text,
	"influence" text,
	"power" text,
	"interest" text,
	"sentiment_baseline" real DEFAULT 0,
	"last_interaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sf_account_id" text,
	"name" text NOT NULL,
	"segment" text,
	"arr" numeric,
	"renewal_date" date,
	"health_score" integer DEFAULT 50,
	"health_details" jsonb,
	"tier" text DEFAULT 'medium',
	"products" jsonb DEFAULT '[]'::jsonb,
	"csm_employee_id" uuid,
	"ae_employee_id" uuid,
	"profile_360" jsonb,
	"signal_thesis" text,
	"beliefs" jsonb DEFAULT '[]'::jsonb,
	"fiscal_year_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"sf_opportunity_id" text,
	"name" text NOT NULL,
	"amount" numeric,
	"stage" text,
	"close_date" date,
	"type" text,
	"owner_employee_id" uuid,
	"push_count" integer DEFAULT 0,
	"probability" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"department" text,
	"sf_user_id" text,
	"ms_user_id" text,
	"wa_phone" text,
	"direct_manager_id" uuid,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb,
	"is_monitored" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"type" text NOT NULL,
	"source" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"processed" boolean DEFAULT false,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"contact_id" uuid,
	"employee_id" uuid,
	"type" text NOT NULL,
	"direction" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"subject" text,
	"summary" text,
	"body_text" text,
	"sentiment" real,
	"sentiment_label" text,
	"key_points" jsonb DEFAULT '[]'::jsonb,
	"urgency" text DEFAULT 'low',
	"source_id" text,
	"source" text,
	"raw_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"severity" text,
	"agent" text NOT NULL,
	"recipient_employee_id" uuid NOT NULL,
	"channel" text DEFAULT 'email',
	"title" text NOT NULL,
	"body" text NOT NULL,
	"recommendation" text,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"acted_on" boolean DEFAULT false,
	"feedback" text,
	"feedback_at" timestamp with time zone,
	"triggering_event_id" uuid,
	"context_snapshot" jsonb,
	"suppressed" boolean DEFAULT false,
	"suppression_reason" text,
	"escalation_due_at" timestamp with time zone,
	"escalated" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sf_credentials" jsonb,
	"ms_credentials" jsonb,
	"wa_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"sf_case_id" text,
	"subject" text NOT NULL,
	"priority" text DEFAULT 'medium',
	"status" text DEFAULT 'open',
	"category" text,
	"opened_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"last_updated_at" timestamp with time zone,
	"owner_employee_id" uuid,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_csm_employee_id_employees_id_fk" FOREIGN KEY ("csm_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_ae_employee_id_employees_id_fk" FOREIGN KEY ("ae_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_employee_id_employees_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_direct_manager_id_employees_id_fk" FOREIGN KEY ("direct_manager_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_recipient_employee_id_employees_id_fk" FOREIGN KEY ("recipient_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_triggering_event_id_events_id_fk" FOREIGN KEY ("triggering_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_owner_employee_id_employees_id_fk" FOREIGN KEY ("owner_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contacts_tenant_sf" ON "contacts" USING btree ("tenant_id","sf_contact_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_tenant_email" ON "contacts" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "idx_contacts_customer" ON "contacts" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customers_tenant_sf" ON "customers" USING btree ("tenant_id","sf_account_id");--> statement-breakpoint
CREATE INDEX "idx_customers_tenant_renewal" ON "customers" USING btree ("tenant_id","renewal_date");--> statement-breakpoint
CREATE INDEX "idx_customers_tenant_tier" ON "customers" USING btree ("tenant_id","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_deals_tenant_sf" ON "deals" USING btree ("tenant_id","sf_opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_employees_tenant_email" ON "employees" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "idx_employees_tenant_ms" ON "employees" USING btree ("tenant_id","ms_user_id");--> statement-breakpoint
CREATE INDEX "idx_events_unprocessed" ON "events" USING btree ("tenant_id","processed","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_interactions_source" ON "interactions" USING btree ("tenant_id","source","source_id");--> statement-breakpoint
CREATE INDEX "idx_interactions_customer_time" ON "interactions" USING btree ("tenant_id","customer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_interactions_employee_time" ON "interactions" USING btree ("tenant_id","employee_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_signals_delivery" ON "signals" USING btree ("tenant_id","recipient_employee_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_signals_customer_active" ON "signals" USING btree ("tenant_id","customer_id","type");--> statement-breakpoint
CREATE INDEX "idx_signals_escalation" ON "signals" USING btree ("escalation_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tickets_tenant_sf" ON "tickets" USING btree ("tenant_id","sf_case_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_customer_status" ON "tickets" USING btree ("tenant_id","customer_id","status");