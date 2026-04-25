/**
 * Hardcoded mock data for Weekend 1 UI scaffolding.
 * Replaced with real API calls to FastAPI in Weekend 4.
 * Values are illustrative — plausible vendor names, realistic PIIDs, but
 * NOT validated against USASpending.
 */

export type RecompeteCandidate = {
  piid: string;
  naics: string;
  title: string;
  subAgency: string;
  incumbent: string;
  incumbentUei?: string | null;
  popEnd: string;
  monthsToPopEnd: number;
  valueMillions: number;
  recompeteScore: number;
  incumbentStrength: number;
};

export const recompeteCandidates: RecompeteCandidate[] = [
  {
    piid: "70FA20-21-F-00184",
    naics: "541512",
    title: "FEMA Mission Support Services",
    subAgency: "FEMA",
    incumbent: "Booz Allen Hamilton",
    popEnd: "2026-03-31",
    monthsToPopEnd: 11,
    valueMillions: 156.2,
    recompeteScore: 94,
    incumbentStrength: 70,
  },
  {
    piid: "HSCEMS-19-F-00022",
    naics: "541511",
    title: "TABSS Enterprise Services — Lot 3",
    subAgency: "ICE",
    incumbent: "Peraton",
    popEnd: "2026-06-30",
    monthsToPopEnd: 14,
    valueMillions: 285.0,
    recompeteScore: 92,
    incumbentStrength: 65,
  },
  {
    piid: "HSHQDC-16-D-E2001",
    naics: "541512",
    title: "EAGLE III Functional Category 1",
    subAgency: "DHS HQ",
    incumbent: "CACI Inc.",
    popEnd: "2026-07-10",
    monthsToPopEnd: 15,
    valueMillions: 518.4,
    recompeteScore: 89,
    incumbentStrength: 80,
  },
  {
    piid: "HSHQDC-16-D-E2048",
    naics: "541512",
    title: "EAGLE III Functional Category 2",
    subAgency: "CBP",
    incumbent: "Leidos",
    popEnd: "2026-09-30",
    monthsToPopEnd: 17,
    valueMillions: 412.7,
    recompeteScore: 87,
    incumbentStrength: 78,
  },
  {
    piid: "70SBUR-22-F-00047",
    naics: "541511",
    title: "USCIS ELIS Platform Development",
    subAgency: "USCIS",
    incumbent: "General Dynamics IT",
    popEnd: "2026-08-15",
    monthsToPopEnd: 16,
    valueMillions: 224.1,
    recompeteScore: 85,
    incumbentStrength: 88,
  },
  {
    piid: "70B02C-20-F-00017",
    naics: "541512",
    title: "CBP ACE Modernization",
    subAgency: "CBP",
    incumbent: "Accenture Federal Services",
    popEnd: "2026-11-30",
    monthsToPopEnd: 19,
    valueMillions: 194.8,
    recompeteScore: 81,
    incumbentStrength: 72,
  },
  {
    piid: "70SBUR-21-F-00102",
    naics: "541511",
    title: "HSIN Sustainment & Evolution",
    subAgency: "DHS HQ",
    incumbent: "ManTech",
    popEnd: "2026-05-01",
    monthsToPopEnd: 12,
    valueMillions: 72.3,
    recompeteScore: 78,
    incumbentStrength: 55,
  },
  {
    piid: "70Z023-22-F-00090",
    naics: "541512",
    title: "Coast Guard Cyber Operations Support",
    subAgency: "USCG",
    incumbent: "Northrop Grumman",
    popEnd: "2026-10-15",
    monthsToPopEnd: 18,
    valueMillions: 112.6,
    recompeteScore: 74,
    incumbentStrength: 68,
  },
  {
    piid: "70RCSA-21-F-00014",
    naics: "541512",
    title: "CISA Vulnerability Disclosure Platform",
    subAgency: "CISA",
    incumbent: "General Dynamics IT",
    popEnd: "2026-12-15",
    monthsToPopEnd: 20,
    valueMillions: 88.4,
    recompeteScore: 71,
    incumbentStrength: 82,
  },
  {
    piid: "HSTS03-19-D-SS005",
    naics: "541512",
    title: "TSA IT Infrastructure Services",
    subAgency: "TSA",
    incumbent: "SAIC",
    popEnd: "2027-01-20",
    monthsToPopEnd: 21,
    valueMillions: 341.5,
    recompeteScore: 68,
    incumbentStrength: 75,
  },
];

export const radarSummary = {
  candidates: 47,
  dollarsAtStakeBillions: 4.82,
  topIncumbent: { name: "Leidos", dollarsBillions: 1.14, awards: 9 },
  marketHhi: 412,
};

export type VendorProfile = {
  id: string;
  name: string;
  uei: string;
  duns: string;
  city: string;
  state: string;
  size: string;
  aliasCount: number;
  lifetimeObligatedBillions: number;
  activeAwards: number;
  agencyCount: number;
  dhsRecompeteExposureBillions: number;
  dhsRecompeteCandidates: number;
  topAgencies: string;
  topNaics: string;
  topNaicsDescription: string;
  awardsByYear: {
    fy: number;
    dod: number;
    dhs: number;
    hhs: number;
    other: number;
    partial?: boolean;
  }[];
  competesWith: { name: string; sharedCells: number; share: number }[];
  activeDhsAwards: {
    piid: string;
    title: string;
    subAgency: string;
    popEnd: string;
    valueMillions: number;
    recompeteScore: number;
  }[];
};

export const vendorProfiles: Record<string, VendorProfile> = {
  leidos: {
    id: "leidos",
    name: "Leidos, Inc.",
    uei: "JDYNCXXXXXXX",
    duns: "123456789",
    city: "Reston",
    state: "VA",
    size: "Large",
    aliasCount: 14,
    lifetimeObligatedBillions: 48.2,
    activeAwards: 312,
    agencyCount: 47,
    dhsRecompeteExposureBillions: 1.14,
    dhsRecompeteCandidates: 9,
    topAgencies: "DoD · DHS · HHS",
    topNaics: "541512 · 541511 · 541330",
    topNaicsDescription: "Computer systems / custom prog / eng",
    awardsByYear: [
      { fy: 2020, dod: 3.0, dhs: 1.0, hhs: 0.5, other: 0.3 },
      { fy: 2021, dod: 3.5, dhs: 1.0, hhs: 0.5, other: 0.4 },
      { fy: 2022, dod: 4.2, dhs: 1.0, hhs: 0.5, other: 0.4 },
      { fy: 2023, dod: 5.2, dhs: 1.0, hhs: 0.5, other: 0.4 },
      { fy: 2024, dod: 6.0, dhs: 1.1, hhs: 0.5, other: 0.3 },
      { fy: 2025, dod: 4.0, dhs: 0.8, hhs: 0.4, other: 0, partial: true },
    ],
    competesWith: [
      { name: "Booz Allen Hamilton", sharedCells: 184, share: 92 },
      { name: "SAIC", sharedCells: 157, share: 78 },
      { name: "CACI Inc.", sharedCells: 141, share: 70 },
      { name: "General Dynamics IT", sharedCells: 128, share: 64 },
      { name: "Peraton", sharedCells: 112, share: 56 },
      { name: "ManTech", sharedCells: 89, share: 44 },
    ],
    activeDhsAwards: [
      {
        piid: "HSHQDC-16-D-E2048",
        title: "EAGLE III FC2",
        subAgency: "CBP",
        popEnd: "2026-09-30",
        valueMillions: 412.7,
        recompeteScore: 87,
      },
      {
        piid: "70RSAT-22-F-00031",
        title: "DHS S&T Data Analytics Support",
        subAgency: "S&T",
        popEnd: "2027-02-14",
        valueMillions: 186.3,
        recompeteScore: 62,
      },
      {
        piid: "HSCEMS-20-F-00058",
        title: "ICE Investigative Case Mgmt",
        subAgency: "ICE",
        popEnd: "2026-12-01",
        valueMillions: 148.9,
        recompeteScore: 83,
      },
      {
        piid: "70B02C-18-F-00201",
        title: "CBP Targeting Systems O&M",
        subAgency: "CBP",
        popEnd: "2026-06-15",
        valueMillions: 121.0,
        recompeteScore: 79,
      },
    ],
  },
};

export type AgencyProfile = {
  id: string;
  name: string;
  subAgencyCount: number;
  description: string;
  fiveYearObligatedBillions: number;
  cagrPct: number;
  uniqueVendors: number;
  hhi: number;
  topNaics: string;
  recompeteExposureBillions: number;
  recompeteCandidates: number;
  pipeline: { quarter: string; dollarsMillions: number; tone: "peak" | "high" | "mid" | "low" }[];
  topVendors: { name: string; share: number; bar: number }[];
  subAgencyBreakdown: {
    name: string;
    fiveYearBillions: number;
    vendors: number;
    hhi: number;
    candidates: number;
    atStakeMillions: number;
    atStakeHot?: boolean;
  }[];
};

export const agencyProfiles: Record<string, AgencyProfile> = {
  dhs: {
    id: "dhs",
    name: "Department of Homeland Security",
    subAgencyCount: 7,
    description: "Cabinet-level · established 2003 · 260,000 employees",
    fiveYearObligatedBillions: 89.4,
    cagrPct: 6.2,
    uniqueVendors: 8412,
    hhi: 412,
    topNaics: "541512 · 541330 · 541519",
    recompeteExposureBillions: 4.82,
    recompeteCandidates: 47,
    pipeline: [
      { quarter: "Q2·26", dollarsMillions: 450, tone: "low" },
      { quarter: "Q3·26", dollarsMillions: 720, tone: "mid" },
      { quarter: "Q4·26", dollarsMillions: 980, tone: "high" },
      { quarter: "Q1·27", dollarsMillions: 1500, tone: "peak" },
      { quarter: "Q2·27", dollarsMillions: 1840, tone: "peak" },
      { quarter: "Q3·27", dollarsMillions: 1720, tone: "peak" },
      { quarter: "Q4·27", dollarsMillions: 1150, tone: "high" },
      { quarter: "Q1·28", dollarsMillions: 900, tone: "mid" },
      { quarter: "Q2·28", dollarsMillions: 640, tone: "mid" },
      { quarter: "Q3·28", dollarsMillions: 380, tone: "low" },
    ],
    topVendors: [
      { name: "Leidos", share: 12.4, bar: 62 },
      { name: "Booz Allen Hamilton", share: 9.8, bar: 49 },
      { name: "General Dynamics IT", share: 8.2, bar: 41 },
      { name: "CACI Inc.", share: 6.9, bar: 35 },
      { name: "Accenture Federal", share: 5.7, bar: 28 },
      { name: "SAIC", share: 5.1, bar: 26 },
      { name: "Peraton", share: 4.3, bar: 22 },
    ],
    subAgencyBreakdown: [
      { name: "CBP",         fiveYearBillions: 22.1, vendors: 1204, hhi: 487, candidates: 12, atStakeMillions: 1420, atStakeHot: true },
      { name: "ICE",         fiveYearBillions: 14.6, vendors:  892, hhi: 615, candidates:  8, atStakeMillions:  912, atStakeHot: true },
      { name: "TSA",         fiveYearBillions: 11.8, vendors:  743, hhi: 528, candidates:  6, atStakeMillions:  684 },
      { name: "USCIS",       fiveYearBillions:  9.2, vendors:  612, hhi: 702, candidates:  5, atStakeMillions:  558 },
      { name: "FEMA",        fiveYearBillions:  8.9, vendors: 1087, hhi: 348, candidates:  7, atStakeMillions:  612, atStakeHot: true },
      { name: "CISA",        fiveYearBillions:  6.4, vendors:  521, hhi: 812, candidates:  4, atStakeMillions:  298 },
      { name: "USCG",        fiveYearBillions:  5.8, vendors:  478, hhi: 604, candidates:  3, atStakeMillions:  214 },
      { name: "DHS HQ / S&T", fiveYearBillions: 10.6, vendors: 895, hhi: 391, candidates:  2, atStakeMillions:  108 },
    ],
  },
};
