{#
  One row per vendor (resolved by UEI for now; full ER lands in Phase 2).
  Powers the vendor profile page.
#}

with awards as (
    select * from {{ ref('mart_awards') }}
    where recipient_uei is not null
),

base as (
    select
        recipient_uei                                                as vendor_uei,
        max(recipient_name)                                          as vendor_name,
        count(distinct award_unique_key)                             as award_count,
        count(distinct award_unique_key) filter (
            where pop_current_end_date >= current_date
        )                                                            as active_award_count,
        sum(total_obligated)                                         as lifetime_obligated,
        max(last_action_date)                                        as last_action_date,
        min(first_action_date)                                       as first_action_date,
        count(distinct awarding_sub_agency_code)                     as sub_agency_count,
        count(distinct naics_code)                                   as naics_count
    from awards
    group by 1
),

top_naics as (
    select distinct on (recipient_uei)
        recipient_uei, naics_code, naics_description
    from (
        select recipient_uei, naics_code, naics_description,
               sum(total_obligated) as v
        from awards
        where naics_code is not null
        group by 1,2,3
    ) t
    order by recipient_uei, v desc
),

top_sub_agency as (
    select distinct on (recipient_uei)
        recipient_uei, awarding_sub_agency_name
    from (
        select recipient_uei, awarding_sub_agency_name,
               sum(total_obligated) as v
        from awards
        where awarding_sub_agency_name is not null
        group by 1,2
    ) t
    order by recipient_uei, v desc
)

select
    b.*,
    n.naics_code              as top_naics_code,
    n.naics_description       as top_naics_description,
    s.awarding_sub_agency_name as top_sub_agency_name
from base b
left join top_naics n      on b.vendor_uei = n.recipient_uei
left join top_sub_agency s on b.vendor_uei = s.recipient_uei
