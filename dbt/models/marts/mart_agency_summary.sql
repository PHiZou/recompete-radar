{#
  Summary by sub-agency. Plus a synthetic 'top-tier' rollup row keyed by
  awarding_agency_code so /agencies/070 can resolve DHS as a whole.
  Powers the agency profile page.
#}

with awards as (
    select * from {{ ref('mart_awards') }}
),

candidates as (
    select * from {{ ref('mart_recompete_candidates') }}
),

sub as (
    select
        awarding_sub_agency_code                       as agency_id,
        max(awarding_sub_agency_name)                  as agency_name,
        max(awarding_agency_name)                      as parent_agency_name,
        'sub'::text                                    as agency_level,
        count(distinct award_unique_key)               as award_count,
        sum(total_obligated)                           as total_obligated,
        count(distinct recipient_uei)                  as unique_vendors,
        count(distinct naics_code)                     as naics_count
    from awards
    where awarding_sub_agency_code is not null
    group by 1
),

top_tier as (
    select
        awarding_agency_code                           as agency_id,
        max(awarding_agency_name)                      as agency_name,
        max(awarding_agency_name)                      as parent_agency_name,
        'top'::text                                    as agency_level,
        count(distinct award_unique_key)               as award_count,
        sum(total_obligated)                           as total_obligated,
        count(distinct recipient_uei)                  as unique_vendors,
        count(distinct naics_code)                     as naics_count
    from awards
    where awarding_agency_code is not null
    group by 1
),

base as (
    select * from sub
    union all
    select * from top_tier
),

candidate_rollup_sub as (
    select
        awarding_sub_agency_code as agency_id,
        count(*) as recompete_candidates,
        sum(total_obligated) as recompete_exposure
    from candidates
    where awarding_sub_agency_code is not null
    group by 1
),

candidate_rollup_top as (
    select
        awarding_agency_code as agency_id,
        count(*) as recompete_candidates,
        sum(total_obligated) as recompete_exposure
    from candidates
    where awarding_agency_code is not null
    group by 1
),

candidate_rollup as (
    select * from candidate_rollup_sub
    union all
    select * from candidate_rollup_top
)

select
    b.*,
    coalesce(c.recompete_candidates, 0) as recompete_candidates,
    coalesce(c.recompete_exposure, 0)   as recompete_exposure
from base b
left join candidate_rollup c on b.agency_id = c.agency_id
