{#
  Cleaned, typed view over the raw USASpending transaction feed.
  One row per modification action (grain unchanged).
  All downstream logic reads from this model, not from `raw` directly.
#}

with src as (
    select *
    from {{ source('raw', 'award_transactions') }}
),

typed as (
    select
        -- identifiers
        award_unique_key,
        piid,
        parent_piid,
        modification_number,

        -- dollars (coalesce nulls to 0 for downstream aggregation safety)
        coalesce(federal_action_obligation, 0)::numeric        as federal_action_obligation,
        coalesce(total_dollars_obligated, 0)::numeric          as total_dollars_obligated,
        coalesce(base_and_exercised_options_value, 0)::numeric as base_and_exercised_options_value,
        coalesce(base_and_all_options_value, 0)::numeric       as base_and_all_options_value,

        -- dates
        action_date,
        pop_start_date,
        pop_current_end_date,
        pop_potential_end_date,

        -- action metadata
        action_type,
        action_type_description,

        -- agency hierarchy (trimmed)
        nullif(trim(awarding_agency_name), '')     as awarding_agency_name,
        nullif(trim(awarding_agency_code), '')     as awarding_agency_code,
        nullif(trim(awarding_sub_agency_name), '') as awarding_sub_agency_name,
        nullif(trim(awarding_sub_agency_code), '') as awarding_sub_agency_code,
        nullif(trim(awarding_office_name), '')     as awarding_office_name,
        nullif(trim(awarding_office_code), '')     as awarding_office_code,

        -- recipient (raw; entity resolution happens in intermediate layer)
        nullif(trim(recipient_uei), '')          as recipient_uei,
        nullif(trim(recipient_duns), '')         as recipient_duns,
        nullif(trim(recipient_name), '')         as recipient_name,
        nullif(trim(recipient_parent_uei), '')   as recipient_parent_uei,
        nullif(trim(recipient_parent_name), '')  as recipient_parent_name,
        recipient_state_code,

        -- classification
        naics_code,
        naics_description,
        psc_code,
        psc_description,

        -- procurement characteristics
        type_of_contract_pricing,
        contract_award_type,
        type_of_set_aside,
        type_of_set_aside_code,
        number_of_offers_received,
        extent_competed,
        solicitation_procedures,

        transaction_description,

        fiscal_year,
        loaded_at
    from src
),

derived as (
    select
        *,
        -- Federal fiscal-year bucket derived from action_date
        -- (Oct–Sep; redundant with fiscal_year col but safer).
        case
            when extract(month from action_date) >= 10
                then extract(year from action_date)::int + 1
            else extract(year from action_date)::int
        end as fy_from_action,

        -- Months remaining until POP end (negative = already ended).
        case
            when pop_current_end_date is not null
                then extract(
                    year from age(pop_current_end_date, current_date)
                ) * 12
                + extract(month from age(pop_current_end_date, current_date))
        end::int as months_to_pop_end
    from typed
)

select * from derived
