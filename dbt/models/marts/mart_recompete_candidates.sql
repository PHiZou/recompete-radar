{#
  Recompete candidates with explainable scoring.

  Grain: one row per award (award_unique_key).
  Filters: active window only — POP-end between 3 months ago and 36 months out.

  Two scores, both 0–100, computed entirely in SQL with named components so
  the UI can show *why* each row scored what it did. See plan §7.
#}

with awards as (
    select * from {{ ref('mart_awards') }}
),

active as (
    select *
    from awards
    where pop_current_end_date is not null
      and pop_current_end_date >= current_date - interval '3 months'
      and pop_current_end_date <= current_date + interval '36 months'
),

with_months as (
    select
        *,
        (extract(year from age(pop_current_end_date, current_date)) * 12
         + extract(month from age(pop_current_end_date, current_date)))::int
            as months_to_pop_end
    from active
),

-- Per-(sub_agency, naics) medians for the "above-median value" component.
medians as (
    select
        awarding_sub_agency_code,
        naics_code,
        percentile_cont(0.5) within group (order by total_obligated)
            as median_obligated
    from awards
    where total_obligated > 0
    group by 1, 2
),

-- Vendor lifetime $ within the slice — feeds incumbent strength.
vendor_totals as (
    select
        recipient_uei,
        sum(total_obligated) as vendor_lifetime_obligated,
        count(distinct award_unique_key) as vendor_award_count,
        max(last_action_date) as vendor_last_action_date
    from awards
    where recipient_uei is not null
    group by 1
),

scored as (
    select
        a.*,

        -- ---------- Recompete score components ----------
        case
            when a.months_to_pop_end <= 6  then 30
            when a.months_to_pop_end <= 12 then 20
            when a.months_to_pop_end <= 24 then 10
            else 0
        end as rs_pop_window_pts,

        case
            when a.contract_award_type ilike '%DEFINITIVE%' then 15
            when a.contract_award_type in ('PURCHASE ORDER', 'PO') then 10
            else 0
        end as rs_definitive_pts,

        case
            when m.median_obligated is not null
                 and a.total_obligated > m.median_obligated then 15
            else 0
        end as rs_above_median_pts,

        -- ---------- Incumbent strength components ----------
        case
            when v.vendor_lifetime_obligated is null then 0
            else least(
                30,
                (ln(greatest(v.vendor_lifetime_obligated, 1)) * 2)::int
            )
        end as is_lifetime_pts,

        case
            when v.vendor_award_count is null then 0
            else least(15, v.vendor_award_count)
        end as is_breadth_pts,

        case
            when v.vendor_last_action_date is null then 0
            when v.vendor_last_action_date >= current_date - interval '12 months' then 20
            when v.vendor_last_action_date >= current_date - interval '24 months' then 10
            else 0
        end as is_recency_pts

    from with_months a
    left join medians m
      on a.awarding_sub_agency_code = m.awarding_sub_agency_code
     and a.naics_code = m.naics_code
    left join vendor_totals v
      on a.recipient_uei = v.recipient_uei
),

final as (
    select
        award_unique_key,
        piid,
        parent_piid,
        naics_code,
        naics_description,
        awarding_agency_code,
        awarding_agency_name,
        awarding_sub_agency_code,
        awarding_sub_agency_name,
        recipient_uei,
        recipient_name,
        contract_award_type,
        type_of_set_aside,
        pop_start_date,
        pop_current_end_date,
        months_to_pop_end,
        total_obligated,
        base_and_exercised_options_value,
        base_and_all_options_value,

        -- exposed components (so the UI can show the breakdown)
        rs_pop_window_pts,
        rs_definitive_pts,
        rs_above_median_pts,
        is_lifetime_pts,
        is_breadth_pts,
        is_recency_pts,

        least(100, rs_pop_window_pts + rs_definitive_pts + rs_above_median_pts)
            as recompete_score,

        least(100, is_lifetime_pts + is_breadth_pts + is_recency_pts)
            as incumbent_strength

    from scored
)

select * from final
