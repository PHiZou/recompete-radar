-- award_unique_key is USASpending's full contract identity:
--   CONT_AWD_<piid>_<piid agency>_<parent_piid or -NONE->_<parent agency>
-- Fails if a contract award's piid / parent_piid disagree with its key, which
-- would mean lookups by (parent_piid, piid) and by award_unique_key can
-- return different contracts.
select award_unique_key, piid, parent_piid
from {{ ref('mart_awards') }}
where award_unique_key like 'CONT\_AWD\_%'
  and (
      split_part(award_unique_key, '_', 3) <> piid
      or nullif(split_part(award_unique_key, '_', 5), '-NONE-') is distinct from parent_piid
  )
