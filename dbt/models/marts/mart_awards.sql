{#
  Collapse transaction-grain rows into award-grain rows.
  One row per `award_unique_key`.

  Weekend-2 scope: core rollup. Scoring marts (mart_recompete_candidates,
  mart_incumbent_strength, mart_hhi) build on top of this in Weekend 3.
#}

with tx as (
    select * from {{ ref('stg_usaspending__award_transactions') }}
),

base as (
    select
        award_unique_key,
        piid,
        parent_piid,

        -- dollars
        sum(federal_action_obligation) as total_obligated,
        max(base_and_exercised_options_value) as base_and_exercised_options_value,
        max(base_and_all_options_value) as base_and_all_options_value,

        -- timing
        min(action_date) as first_action_date,
        max(action_date) as last_action_date,
        min(pop_start_date) as pop_start_date,
        max(pop_current_end_date) as pop_current_end_date,
        max(pop_potential_end_date) as pop_potential_end_date,

        -- count mods
        count(*) as action_count,

        -- classification (take the most recent non-null)
        {{ last_non_null('naics_code', 'action_date') }}             as naics_code,
        {{ last_non_null('naics_description', 'action_date') }}      as naics_description,
        {{ last_non_null('psc_code', 'action_date') }}               as psc_code,
        {{ last_non_null('psc_description', 'action_date') }}        as psc_description,

        -- agency
        {{ last_non_null('awarding_agency_name', 'action_date') }}     as awarding_agency_name,
        {{ last_non_null('awarding_agency_code', 'action_date') }}     as awarding_agency_code,
        {{ last_non_null('awarding_sub_agency_name', 'action_date') }} as awarding_sub_agency_name,
        {{ last_non_null('awarding_sub_agency_code', 'action_date') }} as awarding_sub_agency_code,

        -- recipient (Weekend-2 TODO: swap for resolved vendor_id from int_vendors)
        {{ last_non_null('recipient_uei', 'action_date') }}          as recipient_uei,
        {{ last_non_null('recipient_name', 'action_date') }}         as recipient_name,

        -- procurement characteristics
        {{ last_non_null('contract_award_type', 'action_date') }}    as contract_award_type,
        {{ last_non_null('type_of_set_aside', 'action_date') }}      as type_of_set_aside,
        {{ last_non_null('extent_competed', 'action_date') }}        as extent_competed

    from tx
    group by 1, 2, 3
)

select * from base
