


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."bca_id" AS ENUM (
    'ccc',
    'selwyn',
    'waimakariri'
);


ALTER TYPE "public"."bca_id" OWNER TO "postgres";


CREATE TYPE "public"."confidence" AS ENUM (
    'low',
    'medium',
    'high'
);


ALTER TYPE "public"."confidence" OWNER TO "postgres";


CREATE TYPE "public"."extractor_kind" AS ENUM (
    'pdfplumber',
    'claude-vision'
);


ALTER TYPE "public"."extractor_kind" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'pre-lodgement',
    'lodged',
    'rfi-open',
    'rfi-responded',
    'decision-pending',
    'granted',
    'declined'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."project_type" AS ENUM (
    'new_dwelling',
    'extension',
    'accessory',
    'deck'
);


ALTER TYPE "public"."project_type" OWNER TO "postgres";


CREATE TYPE "public"."reconciliation_state" AS ENUM (
    'agree',
    'ai_extends_rules',
    'disagree',
    'rules_override'
);


ALTER TYPE "public"."reconciliation_state" OWNER TO "postgres";


CREATE TYPE "public"."severity" AS ENUM (
    'must_resolve',
    'nice_to_have'
);


ALTER TYPE "public"."severity" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfi_item_id" "uuid",
    "project_id" "uuid",
    "filename" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attachments_check" CHECK ((("rfi_item_id" IS NOT NULL) OR ("project_id" IS NOT NULL)))
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "project_id" "uuid",
    "action" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."bca_corpus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bca" "public"."bca_id" NOT NULL,
    "project_type" "public"."project_type",
    "category" "text" NOT NULL,
    "severity" "public"."severity" NOT NULL,
    "example_text" "text" NOT NULL,
    "trigger_description" "text",
    "resolution_hint" "text",
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bca_corpus" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfi_item_id" "uuid" NOT NULL,
    "prong" "text" NOT NULL,
    "primary_category" "text" NOT NULL,
    "secondary_category" "text",
    "severity" "public"."severity" NOT NULL,
    "confidence" "public"."confidence" NOT NULL,
    "reasoning" "text",
    "rule_ids" "text"[],
    "rules_version" "text",
    "prompt_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "classifications_prong_check" CHECK (("prong" = ANY (ARRAY['rules'::"text", 'ai'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."classifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "analyser_version" "text",
    "prompt_version" "text",
    "analysis" "jsonb",
    "processing_ms" integer,
    "cost_usd" numeric(10,6),
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "analysis_version" "text",
    "verification_prompt_version" "text",
    "verification_drops" "jsonb",
    "image_count" integer,
    "dpi_breakdown" "jsonb",
    "content_hash" "text",
    "provider" "text",
    "model_id" "text"
);


ALTER TABLE "public"."plan_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "address" "text" NOT NULL,
    "bca" "public"."bca_id" NOT NULL,
    "project_type" "public"."project_type" NOT NULL,
    "description" "text",
    "application_ref" "text",
    "status" "public"."project_status" DEFAULT 'pre-lodgement'::"public"."project_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "city" "text",
    "postalcode" "text"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prompt_eval_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prompt_version" "text" NOT NULL,
    "prompt_type" "text" NOT NULL,
    "eval_set_version" "text" NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "n_plans" integer NOT NULL,
    "precision_avg" numeric(5,4),
    "recall_avg" numeric(5,4),
    "hallucination_rate" numeric(5,4),
    "per_plan_results" "jsonb",
    "notes" "text"
);


ALTER TABLE "public"."prompt_eval_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prompt_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prompt_key" "text" NOT NULL,
    "version" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "prompt_content" "text" NOT NULL,
    "model" "text" NOT NULL,
    "deployed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prompt_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reconciliation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfi_item_id" "uuid" NOT NULL,
    "state" "public"."reconciliation_state" NOT NULL,
    "rules_output" "jsonb" NOT NULL,
    "ai_output" "jsonb" NOT NULL,
    "final_category" "text" NOT NULL,
    "final_severity" "public"."severity" NOT NULL,
    "rules_version" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "user_resolved_choice" "text",
    "user_resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reconciliation_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfi_item_id" "uuid" NOT NULL,
    "draft_text" "text" NOT NULL,
    "edited_text" "text",
    "edit_distance" integer,
    "prompt_version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfi_extractions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfi_letter_id" "uuid" NOT NULL,
    "extractor" "public"."extractor_kind" NOT NULL,
    "extractor_version" "text" NOT NULL,
    "raw_output" "jsonb" NOT NULL,
    "processing_ms" integer,
    "cost_usd" numeric(10,6),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfi_extractions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfi_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfi_letter_id" "uuid" NOT NULL,
    "item_id" "text" NOT NULL,
    "raw_number" "text",
    "raw_text" "text" NOT NULL,
    "page" integer,
    "bbox" "jsonb",
    "extracted" "jsonb" NOT NULL,
    "ordering" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfi_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfi_letters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "rfi_number" integer,
    "issue_date" "date",
    "response_deadline" "date",
    "officer_name" "text",
    "original_storage_path" "text" NOT NULL,
    "canonical_json" "jsonb",
    "rendered_markdown" "text",
    "extraction_metadata" "jsonb",
    "status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfi_letters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rules_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "yaml_content" "text" NOT NULL,
    "deployed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rules_versions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bca_corpus"
    ADD CONSTRAINT "bca_corpus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classifications"
    ADD CONSTRAINT "classifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_uploads"
    ADD CONSTRAINT "plan_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_eval_runs"
    ADD CONSTRAINT "prompt_eval_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_versions"
    ADD CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_versions"
    ADD CONSTRAINT "prompt_versions_prompt_key_version_key" UNIQUE ("prompt_key", "version");



ALTER TABLE ONLY "public"."reconciliation_log"
    ADD CONSTRAINT "reconciliation_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."responses"
    ADD CONSTRAINT "responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."responses"
    ADD CONSTRAINT "responses_rfi_item_id_key" UNIQUE ("rfi_item_id");



ALTER TABLE ONLY "public"."rfi_extractions"
    ADD CONSTRAINT "rfi_extractions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfi_items"
    ADD CONSTRAINT "rfi_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfi_items"
    ADD CONSTRAINT "rfi_items_rfi_letter_id_item_id_key" UNIQUE ("rfi_letter_id", "item_id");



ALTER TABLE ONLY "public"."rfi_letters"
    ADD CONSTRAINT "rfi_letters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rules_versions"
    ADD CONSTRAINT "rules_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rules_versions"
    ADD CONSTRAINT "rules_versions_version_key" UNIQUE ("version");



CREATE INDEX "attachments_item_idx" ON "public"."attachments" USING "btree" ("rfi_item_id");



CREATE INDEX "attachments_project_idx" ON "public"."attachments" USING "btree" ("project_id");



CREATE INDEX "audit_log_project_idx" ON "public"."audit_log" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "bca_corpus_bca_idx" ON "public"."bca_corpus" USING "btree" ("bca", "project_type");



CREATE INDEX "bca_corpus_category_idx" ON "public"."bca_corpus" USING "btree" ("category");



CREATE INDEX "classifications_item_idx" ON "public"."classifications" USING "btree" ("rfi_item_id");



CREATE INDEX "classifications_prong_idx" ON "public"."classifications" USING "btree" ("prong");



CREATE INDEX "plan_uploads_cache_lookup_idx" ON "public"."plan_uploads" USING "btree" ("content_hash", "analyser_version", "prompt_version", "provider", "model_id") WHERE ("status" = 'analysed'::"text");



CREATE INDEX "plan_uploads_project_idx" ON "public"."plan_uploads" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "projects_status_idx" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "prompt_eval_runs_version_idx" ON "public"."prompt_eval_runs" USING "btree" ("prompt_type", "prompt_version", "run_at" DESC);



CREATE INDEX "reconciliation_log_item_idx" ON "public"."reconciliation_log" USING "btree" ("rfi_item_id");



CREATE INDEX "reconciliation_log_state_idx" ON "public"."reconciliation_log" USING "btree" ("state", "created_at" DESC);



CREATE INDEX "rfi_items_letter_idx" ON "public"."rfi_items" USING "btree" ("rfi_letter_id", "ordering");



CREATE INDEX "rfi_letters_project_id_idx" ON "public"."rfi_letters" USING "btree" ("project_id");



CREATE OR REPLACE TRIGGER "plan_uploads_updated_at" BEFORE UPDATE ON "public"."plan_uploads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "responses_updated_at" BEFORE UPDATE ON "public"."responses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "rfi_letters_updated_at" BEFORE UPDATE ON "public"."rfi_letters" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_rfi_item_id_fkey" FOREIGN KEY ("rfi_item_id") REFERENCES "public"."rfi_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classifications"
    ADD CONSTRAINT "classifications_rfi_item_id_fkey" FOREIGN KEY ("rfi_item_id") REFERENCES "public"."rfi_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_uploads"
    ADD CONSTRAINT "plan_uploads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reconciliation_log"
    ADD CONSTRAINT "reconciliation_log_rfi_item_id_fkey" FOREIGN KEY ("rfi_item_id") REFERENCES "public"."rfi_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."responses"
    ADD CONSTRAINT "responses_rfi_item_id_fkey" FOREIGN KEY ("rfi_item_id") REFERENCES "public"."rfi_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfi_extractions"
    ADD CONSTRAINT "rfi_extractions_rfi_letter_id_fkey" FOREIGN KEY ("rfi_letter_id") REFERENCES "public"."rfi_letters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfi_items"
    ADD CONSTRAINT "rfi_items_rfi_letter_id_fkey" FOREIGN KEY ("rfi_letter_id") REFERENCES "public"."rfi_letters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfi_letters"
    ADD CONSTRAINT "rfi_letters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE "public"."bca_corpus" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bca_corpus_read" ON "public"."bca_corpus" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."prompt_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prompt_versions_read" ON "public"."prompt_versions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."rules_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rules_versions_read" ON "public"."rules_versions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bca_corpus" TO "anon";
GRANT ALL ON TABLE "public"."bca_corpus" TO "authenticated";
GRANT ALL ON TABLE "public"."bca_corpus" TO "service_role";



GRANT ALL ON TABLE "public"."classifications" TO "anon";
GRANT ALL ON TABLE "public"."classifications" TO "authenticated";
GRANT ALL ON TABLE "public"."classifications" TO "service_role";



GRANT ALL ON TABLE "public"."plan_uploads" TO "anon";
GRANT ALL ON TABLE "public"."plan_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."prompt_eval_runs" TO "anon";
GRANT ALL ON TABLE "public"."prompt_eval_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."prompt_eval_runs" TO "service_role";



GRANT ALL ON TABLE "public"."prompt_versions" TO "anon";
GRANT ALL ON TABLE "public"."prompt_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."prompt_versions" TO "service_role";



GRANT ALL ON TABLE "public"."reconciliation_log" TO "anon";
GRANT ALL ON TABLE "public"."reconciliation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."reconciliation_log" TO "service_role";



GRANT ALL ON TABLE "public"."responses" TO "anon";
GRANT ALL ON TABLE "public"."responses" TO "authenticated";
GRANT ALL ON TABLE "public"."responses" TO "service_role";



GRANT ALL ON TABLE "public"."rfi_extractions" TO "anon";
GRANT ALL ON TABLE "public"."rfi_extractions" TO "authenticated";
GRANT ALL ON TABLE "public"."rfi_extractions" TO "service_role";



GRANT ALL ON TABLE "public"."rfi_items" TO "anon";
GRANT ALL ON TABLE "public"."rfi_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rfi_items" TO "service_role";



GRANT ALL ON TABLE "public"."rfi_letters" TO "anon";
GRANT ALL ON TABLE "public"."rfi_letters" TO "authenticated";
GRANT ALL ON TABLE "public"."rfi_letters" TO "service_role";



GRANT ALL ON TABLE "public"."rules_versions" TO "anon";
GRANT ALL ON TABLE "public"."rules_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."rules_versions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


  create policy "attachments_open"
  on "storage"."objects"
  as permissive
  for all
  to anon, authenticated
using ((bucket_id = 'attachments'::text))
with check ((bucket_id = 'attachments'::text));



  create policy "exports_open"
  on "storage"."objects"
  as permissive
  for all
  to anon, authenticated
using ((bucket_id = 'exports'::text))
with check ((bucket_id = 'exports'::text));



  create policy "plans_open"
  on "storage"."objects"
  as permissive
  for all
  to anon, authenticated
using ((bucket_id = 'plans'::text))
with check ((bucket_id = 'plans'::text));



  create policy "rfi_uploads_open"
  on "storage"."objects"
  as permissive
  for all
  to anon, authenticated
using ((bucket_id = 'rfi-uploads'::text))
with check ((bucket_id = 'rfi-uploads'::text));



