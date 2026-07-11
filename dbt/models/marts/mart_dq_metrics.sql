{#
  Data-quality metrics, one row per metric, refreshed every dbt build.
  Feeds the /quality dashboard alongside dbt test outcomes.

  Groups:
    row_count  — grain sizes of each mart (spot shrink/blowups)
    freshness  — how stale the raw feed is (max loaded_at, days behind)
    null_rate  — % null on columns that drive scoring/alerting
    coverage   — distinct agencies present (multi-agency health)
#}

with raw_src as (
    select * from {{ source('raw', 'award_transactions') }}
),
awards as (select * from {{ ref('mart_awards') }}),
candidates as (select * from {{ ref('mart_recompete_candidates') }}),
vendors as (select * from {{ ref('mart_vendors') }}),
agencies as (select * from {{ ref('mart_agency_summary') }}),

metrics as (

    -- row counts --------------------------------------------------------
    select 'row_count' as metric_group, 'mart_awards' as metric,
           count(*)::float as value, 'rows' as unit from awards
    union all
    select 'row_count', 'mart_recompete_candidates',
           count(*)::float, 'rows' from candidates
    union all
    select 'row_count', 'mart_vendors', count(*)::float, 'rows' from vendors
    union all
    select 'row_count', 'mart_agency_summary', count(*)::float, 'rows' from agencies

    -- freshness ---------------------------------------------------------
    union all
    select 'freshness', 'raw_max_loaded_at',
           extract(epoch from max(loaded_at))::float, 'epoch_seconds' from raw_src
    union all
    select 'freshness', 'raw_days_stale',
           extract(epoch from (now() - max(loaded_at)))::float / 86400.0,
           'days' from raw_src

    -- null rates on scoring/alerting drivers -----------------------------
    union all
    select 'null_rate', 'candidates.pop_current_end_date',
           avg((pop_current_end_date is null)::int)::float, 'fraction' from candidates
    union all
    select 'null_rate', 'candidates.recipient_uei',
           avg((recipient_uei is null)::int)::float, 'fraction' from candidates
    union all
    select 'null_rate', 'awards.naics_code',
           avg((naics_code is null)::int)::float, 'fraction' from awards

    -- coverage ----------------------------------------------------------
    union all
    select 'coverage', 'distinct_top_agencies',
           count(distinct awarding_agency_code)::float, 'agencies' from awards
)

select
    metric_group,
    metric,
    value,
    unit,
    now() as computed_at
from metrics
