/**
 * A broad starting catalogue of universities worldwide, so the selector is
 * useful on day one. Students can also add their own, which is persisted in
 * Postgres (custom_universities) and merged into search.
 */
export interface University {
  id: string;
  name: string;
  city: string;
  country: string;
  region: Region;
}

export type Region =
  | "Africa"
  | "Asia"
  | "Europe"
  | "Middle East"
  | "North America"
  | "Oceania"
  | "South America";

type Row = [name: string, city: string, country: string, region: Region];

const ROWS: Row[] = [
  ["Aalto University", "Espoo", "Finland", "Europe"],
  ["Aarhus University", "Aarhus", "Denmark", "Europe"],
  ["Addis Ababa University", "Addis Ababa", "Ethiopia", "Africa"],
  ["American University in Cairo", "Cairo", "Egypt", "Middle East"],
  ["American University of Beirut", "Beirut", "Lebanon", "Middle East"],
  ["Amsterdam University of Applied Sciences", "Amsterdam", "Netherlands", "Europe"],
  ["Ankara University", "Ankara", "Türkiye", "Middle East"],
  ["Aristotle University of Thessaloniki", "Thessaloniki", "Greece", "Europe"],
  ["Auckland University of Technology", "Auckland", "New Zealand", "Oceania"],
  ["Australian National University", "Canberra", "Australia", "Oceania"],
  ["Autonomous University of Barcelona", "Barcelona", "Spain", "Europe"],
  ["Autonomous University of Madrid", "Madrid", "Spain", "Europe"],
  ["Bahcesehir University", "Istanbul", "Türkiye", "Middle East"],
  ["Beijing Normal University", "Beijing", "China", "Asia"],
  ["Bocconi University", "Milan", "Italy", "Europe"],
  ["Boston University", "Boston", "United States", "North America"],
  ["Brown University", "Providence", "United States", "North America"],
  ["Cairo University", "Giza", "Egypt", "Middle East"],
  ["Carnegie Mellon University", "Pittsburgh", "United States", "North America"],
  ["Catholic University of Chile", "Santiago", "Chile", "South America"],
  ["Central University of Venezuela", "Caracas", "Venezuela", "South America"],
  ["Chalmers University of Technology", "Gothenburg", "Sweden", "Europe"],
  ["Charles University", "Prague", "Czechia", "Europe"],
  ["Chinese University of Hong Kong", "Hong Kong", "Hong Kong", "Asia"],
  ["Chulalongkorn University", "Bangkok", "Thailand", "Asia"],
  ["City University of Hong Kong", "Hong Kong", "Hong Kong", "Asia"],
  ["Complutense University of Madrid", "Madrid", "Spain", "Europe"],
  ["Concordia University", "Montreal", "Canada", "North America"],
  ["Copenhagen Business School", "Copenhagen", "Denmark", "Europe"],
  ["Cornell University", "Ithaca", "United States", "North America"],
  ["Covenant University", "Ota", "Nigeria", "Africa"],
  ["Dalhousie University", "Halifax", "Canada", "North America"],
  ["Dartmouth College", "Hanover", "United States", "North America"],
  ["Delft University of Technology", "Delft", "Netherlands", "Europe"],
  ["Duke University", "Durham", "United States", "North America"],
  ["ETH Zurich", "Zurich", "Switzerland", "Europe"],
  ["Ege University", "Izmir", "Türkiye", "Middle East"],
  ["Eindhoven University of Technology", "Eindhoven", "Netherlands", "Europe"],
  ["Emory University", "Atlanta", "United States", "North America"],
  ["Erasmus University Rotterdam", "Rotterdam", "Netherlands", "Europe"],
  ["Federal University of Rio de Janeiro", "Rio de Janeiro", "Brazil", "South America"],
  ["Flinders University", "Adelaide", "Australia", "Oceania"],
  ["Freie Universität Berlin", "Berlin", "Germany", "Europe"],
  ["Fudan University", "Shanghai", "China", "Asia"],
  ["Georgetown University", "Washington", "United States", "North America"],
  ["Georgia Institute of Technology", "Atlanta", "United States", "North America"],
  ["Ghent University", "Ghent", "Belgium", "Europe"],
  ["Griffith University", "Brisbane", "Australia", "Oceania"],
  ["Hanyang University", "Seoul", "South Korea", "Asia"],
  ["Harvard University", "Cambridge", "United States", "North America"],
  ["Hebrew University of Jerusalem", "Jerusalem", "Israel", "Middle East"],
  ["Heidelberg University", "Heidelberg", "Germany", "Europe"],
  ["Humboldt University of Berlin", "Berlin", "Germany", "Europe"],
  ["Imperial College London", "London", "United Kingdom", "Europe"],
  ["Indian Institute of Technology Bombay", "Mumbai", "India", "Asia"],
  ["Indian Institute of Technology Delhi", "New Delhi", "India", "Asia"],
  ["Indiana University Bloomington", "Bloomington", "United States", "North America"],
  ["ITAM", "Mexico City", "Mexico", "North America"],
  ["James Cook University", "Townsville", "Australia", "Oceania"],
  ["Jawaharlal Nehru University", "New Delhi", "India", "Asia"],
  ["Johns Hopkins University", "Baltimore", "United States", "North America"],
  ["KAIST", "Daejeon", "South Korea", "Asia"],
  ["Karlsruhe Institute of Technology", "Karlsruhe", "Germany", "Europe"],
  ["Keio University", "Tokyo", "Japan", "Asia"],
  ["Kenyatta University", "Nairobi", "Kenya", "Africa"],
  ["King's College London", "London", "United Kingdom", "Europe"],
  ["Korea University", "Seoul", "South Korea", "Asia"],
  ["KU Leuven", "Leuven", "Belgium", "Europe"],
  ["Kyoto University", "Kyoto", "Japan", "Asia"],
  ["Lancaster University", "Lancaster", "United Kingdom", "Europe"],
  ["Laval University", "Quebec City", "Canada", "North America"],
  ["Leiden University", "Leiden", "Netherlands", "Europe"],
  ["Lomonosov Moscow State University", "Moscow", "Russia", "Europe"],
  ["London School of Economics", "London", "United Kingdom", "Europe"],
  ["Lund University", "Lund", "Sweden", "Europe"],
  ["Macquarie University", "Sydney", "Australia", "Oceania"],
  ["Makerere University", "Kampala", "Uganda", "Africa"],
  ["Malaysia University of Science and Technology", "Kuala Lumpur", "Malaysia", "Asia"],
  ["McGill University", "Montreal", "Canada", "North America"],
  ["McMaster University", "Hamilton", "Canada", "North America"],
  ["Melbourne Polytechnic", "Melbourne", "Australia", "Oceania"],
  ["Michigan State University", "East Lansing", "United States", "North America"],
  ["Middle East Technical University", "Ankara", "Türkiye", "Middle East"],
  ["Monash University", "Melbourne", "Australia", "Oceania"],
  ["National Autonomous University of Mexico", "Mexico City", "Mexico", "North America"],
  ["National Cheng Kung University", "Tainan", "Taiwan", "Asia"],
  ["National University of Colombia", "Bogotá", "Colombia", "South America"],
  ["National University of Ireland Galway", "Galway", "Ireland", "Europe"],
  ["National University of Malaysia", "Bangi", "Malaysia", "Asia"],
  ["National University of San Marcos", "Lima", "Peru", "South America"],
  ["National University of Singapore", "Singapore", "Singapore", "Asia"],
  ["New York University", "New York", "United States", "North America"],
  ["Newcastle University", "Newcastle", "United Kingdom", "Europe"],
  ["Northwestern University", "Evanston", "United States", "North America"],
  ["Norwegian University of Science and Technology", "Trondheim", "Norway", "Europe"],
  ["Obafemi Awolowo University", "Ile-Ife", "Nigeria", "Africa"],
  ["Osaka University", "Osaka", "Japan", "Asia"],
  ["Oulu University", "Oulu", "Finland", "Europe"],
  ["Oxford Brookes University", "Oxford", "United Kingdom", "Europe"],
  ["Penn State University", "University Park", "United States", "North America"],
  ["Peking University", "Beijing", "China", "Asia"],
  ["Polytechnic University of Catalonia", "Barcelona", "Spain", "Europe"],
  ["Polytechnic University of Madrid", "Madrid", "Spain", "Europe"],
  ["Pontifical Catholic University of Chile", "Santiago", "Chile", "South America"],
  ["Princeton University", "Princeton", "United States", "North America"],
  ["Purdue University", "West Lafayette", "United States", "North America"],
  ["Queensland University of Technology", "Brisbane", "Australia", "Oceania"],
  ["Rice University", "Houston", "United States", "North America"],
  ["RMIT University", "Melbourne", "Australia", "Oceania"],
  ["Rutgers University", "New Brunswick", "United States", "North America"],
  ["RWTH Aachen University", "Aachen", "Germany", "Europe"],
  ["Sabanci University", "Istanbul", "Türkiye", "Middle East"],
  ["Sapienza University of Rome", "Rome", "Italy", "Europe"],
  ["Seoul National University", "Seoul", "South Korea", "Asia"],
  ["Simon Fraser University", "Burnaby", "Canada", "North America"],
  ["SOAS University of London", "London", "United Kingdom", "Europe"],
  ["Stanford University", "Stanford", "United States", "North America"],
  ["Stockholm University", "Stockholm", "Sweden", "Europe"],
  ["Sungkyunkwan University", "Seoul", "South Korea", "Asia"],
  ["Technical University of Berlin", "Berlin", "Germany", "Europe"],
  ["Technical University of Munich", "Munich", "Germany", "Europe"],
  ["Tel Aviv University", "Tel Aviv", "Israel", "Middle East"],
  ["Texas A&M University", "College Station", "United States", "North America"],
  ["The Ohio State University", "Columbus", "United States", "North America"],
  ["Trinity College Dublin", "Dublin", "Ireland", "Europe"],
  ["Tsinghua University", "Beijing", "China", "Asia"],
  ["TU Dortmund University", "Dortmund", "Germany", "Europe"],
  ["Tulane University", "New Orleans", "United States", "North America"],
  ["Universidad de los Andes", "Bogotá", "Colombia", "South America"],
  ["Universidad Torcuato Di Tella", "Buenos Aires", "Argentina", "South America"],
  ["Universitat Pompeu Fabra", "Barcelona", "Spain", "Europe"],
  ["University College Cork", "Cork", "Ireland", "Europe"],
  ["University College Dublin", "Dublin", "Ireland", "Europe"],
  ["University College London", "London", "United Kingdom", "Europe"],
  ["University of Aberdeen", "Aberdeen", "United Kingdom", "Europe"],
  ["University of Adelaide", "Adelaide", "Australia", "Oceania"],
  ["University of Alberta", "Edmonton", "Canada", "North America"],
  ["University of Amsterdam", "Amsterdam", "Netherlands", "Europe"],
  ["University of Auckland", "Auckland", "New Zealand", "Oceania"],
  ["University of Basel", "Basel", "Switzerland", "Europe"],
  ["University of Bath", "Bath", "United Kingdom", "Europe"],
  ["University of Bergen", "Bergen", "Norway", "Europe"],
  ["University of Birmingham", "Birmingham", "United Kingdom", "Europe"],
  ["University of Bologna", "Bologna", "Italy", "Europe"],
  ["University of Bristol", "Bristol", "United Kingdom", "Europe"],
  ["University of British Columbia", "Vancouver", "Canada", "North America"],
  ["University of Buenos Aires", "Buenos Aires", "Argentina", "South America"],
  ["University of California, Berkeley", "Berkeley", "United States", "North America"],
  ["University of California, Davis", "Davis", "United States", "North America"],
  ["University of California, Irvine", "Irvine", "United States", "North America"],
  ["University of California, Los Angeles", "Los Angeles", "United States", "North America"],
  ["University of California, San Diego", "San Diego", "United States", "North America"],
  ["University of Cape Town", "Cape Town", "South Africa", "Africa"],
  ["University of Chicago", "Chicago", "United States", "North America"],
  ["University of Cologne", "Cologne", "Germany", "Europe"],
  ["University of Copenhagen", "Copenhagen", "Denmark", "Europe"],
  ["University of Delhi", "New Delhi", "India", "Asia"],
  ["University of Dhaka", "Dhaka", "Bangladesh", "Asia"],
  ["University of Edinburgh", "Edinburgh", "United Kingdom", "Europe"],
  ["University of Exeter", "Exeter", "United Kingdom", "Europe"],
  ["University of Florence", "Florence", "Italy", "Europe"],
  ["University of Ghana", "Accra", "Ghana", "Africa"],
  ["University of Glasgow", "Glasgow", "United Kingdom", "Europe"],
  ["University of Gothenburg", "Gothenburg", "Sweden", "Europe"],
  ["University of Groningen", "Groningen", "Netherlands", "Europe"],
  ["University of Helsinki", "Helsinki", "Finland", "Europe"],
  ["University of Hong Kong", "Hong Kong", "Hong Kong", "Asia"],
  ["University of Ibadan", "Ibadan", "Nigeria", "Africa"],
  ["University of Illinois Urbana-Champaign", "Urbana", "United States", "North America"],
  ["University of Indonesia", "Depok", "Indonesia", "Asia"],
  ["University of Ilorin", "Ilorin", "Nigeria", "Africa"],
  ["University of Johannesburg", "Johannesburg", "South Africa", "Africa"],
  ["University of Jordan", "Amman", "Jordan", "Middle East"],
  ["University of Kansas", "Lawrence", "United States", "North America"],
  ["University of Lagos", "Lagos", "Nigeria", "Africa"],
  ["University of Leeds", "Leeds", "United Kingdom", "Europe"],
  ["University of Lisbon", "Lisbon", "Portugal", "Europe"],
  ["University of Liverpool", "Liverpool", "United Kingdom", "Europe"],
  ["University of Ljubljana", "Ljubljana", "Slovenia", "Europe"],
  ["University of Malaya", "Kuala Lumpur", "Malaysia", "Asia"],
  ["University of Manchester", "Manchester", "United Kingdom", "Europe"],
  ["University of Manitoba", "Winnipeg", "Canada", "North America"],
  ["University of Maryland", "College Park", "United States", "North America"],
  ["University of Melbourne", "Melbourne", "Australia", "Oceania"],
  ["University of Miami", "Coral Gables", "United States", "North America"],
  ["University of Michigan", "Ann Arbor", "United States", "North America"],
  ["University of Milan", "Milan", "Italy", "Europe"],
  ["University of Minnesota", "Minneapolis", "United States", "North America"],
  ["University of Montréal", "Montreal", "Canada", "North America"],
  ["University of Nairobi", "Nairobi", "Kenya", "Africa"],
  ["University of New South Wales", "Sydney", "Australia", "Oceania"],
  ["University of Newcastle", "Newcastle", "Australia", "Oceania"],
  ["University of North Carolina at Chapel Hill", "Chapel Hill", "United States", "North America"],
  ["University of Notre Dame", "Notre Dame", "United States", "North America"],
  ["University of Nottingham", "Nottingham", "United Kingdom", "Europe"],
  ["University of Oslo", "Oslo", "Norway", "Europe"],
  ["University of Otago", "Dunedin", "New Zealand", "Oceania"],
  ["University of Ottawa", "Ottawa", "Canada", "North America"],
  ["University of Oxford", "Oxford", "United Kingdom", "Europe"],
  ["University of Padua", "Padua", "Italy", "Europe"],
  ["University of Pennsylvania", "Philadelphia", "United States", "North America"],
  ["University of Pittsburgh", "Pittsburgh", "United States", "North America"],
  ["University of Porto", "Porto", "Portugal", "Europe"],
  ["University of Pretoria", "Pretoria", "South Africa", "Africa"],
  ["University of Queensland", "Brisbane", "Australia", "Oceania"],
  ["University of Reading", "Reading", "United Kingdom", "Europe"],
  ["University of Rochester", "Rochester", "United States", "North America"],
  ["University of São Paulo", "São Paulo", "Brazil", "South America"],
  ["University of Seoul", "Seoul", "South Korea", "Asia"],
  ["University of Sheffield", "Sheffield", "United Kingdom", "Europe"],
  ["University of Southampton", "Southampton", "United Kingdom", "Europe"],
  ["University of St Andrews", "St Andrews", "United Kingdom", "Europe"],
  ["University of Stellenbosch", "Stellenbosch", "South Africa", "Africa"],
  ["University of Strasbourg", "Strasbourg", "France", "Europe"],
  ["University of Sydney", "Sydney", "Australia", "Oceania"],
  ["University of Tokyo", "Tokyo", "Japan", "Asia"],
  ["University of Toronto", "Toronto", "Canada", "North America"],
  ["University of Trento", "Trento", "Italy", "Europe"],
  ["University of Tübingen", "Tübingen", "Germany", "Europe"],
  ["University of Twente", "Enschede", "Netherlands", "Europe"],
  ["University of Valencia", "Valencia", "Spain", "Europe"],
  ["University of Vienna", "Vienna", "Austria", "Europe"],
  ["University of Warwick", "Coventry", "United Kingdom", "Europe"],
  ["University of Washington", "Seattle", "United States", "North America"],
  ["University of Waterloo", "Waterloo", "Canada", "North America"],
  ["University of the Western Cape", "Cape Town", "South Africa", "Africa"],
  ["University of the Witwatersrand", "Johannesburg", "South Africa", "Africa"],
  ["University of Wisconsin–Madison", "Madison", "United States", "North America"],
  ["University of Wollongong", "Wollongong", "Australia", "Oceania"],
  ["University of York", "York", "United Kingdom", "Europe"],
  ["Uppsala University", "Uppsala", "Sweden", "Europe"],
  ["Utrecht University", "Utrecht", "Netherlands", "Europe"],
  ["Vanderbilt University", "Nashville", "United States", "North America"],
  ["Victoria University of Wellington", "Wellington", "New Zealand", "Oceania"],
  ["Vienna University of Economics and Business", "Vienna", "Austria", "Europe"],
  ["Virginia Tech", "Blacksburg", "United States", "North America"],
  ["Wageningen University", "Wageningen", "Netherlands", "Europe"],
  ["Waseda University", "Tokyo", "Japan", "Asia"],
  ["Washington University in St. Louis", "St. Louis", "United States", "North America"],
  ["Western University", "London", "Canada", "North America"],
  ["Yale University", "New Haven", "United States", "North America"],
  ["Yonsei University", "Seoul", "South Korea", "Asia"],
  ["York University", "Toronto", "Canada", "North America"],
  ["Zhejiang University", "Hangzhou", "China", "Asia"],
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const UNIVERSITIES: University[] = ROWS.map(([name, city, country, region]) => ({
  id: `u-${slug(name)}`,
  name,
  city,
  country,
  region,
})).sort((a, b) => a.name.localeCompare(b.name));

export const UNIVERSITY_COUNTRIES = [...new Set(UNIVERSITIES.map((u) => u.country))].sort();

/** Every country, not just those that already have a seeded university. */
export const COUNTRIES = [
  ...new Set([
    ...UNIVERSITY_COUNTRIES,
    "Algeria", "Angola", "Argentina", "Armenia", "Austria", "Azerbaijan", "Bahrain", "Bangladesh",
    "Belarus", "Belgium", "Bolivia", "Botswana", "Brazil", "Bulgaria", "Cambodia", "Cameroon",
    "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia", "Cyprus", "Czechia",
    "Denmark", "Ecuador", "Egypt", "Estonia", "Ethiopia", "Finland", "France", "Georgia",
    "Germany", "Ghana", "Greece", "Guatemala", "Hong Kong", "Hungary", "Iceland", "India",
    "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan",
    "Kazakhstan", "Kenya", "Kuwait", "Latvia", "Lebanon", "Lithuania", "Luxembourg", "Malawi",
    "Malaysia", "Malta", "Mexico", "Morocco", "Mozambique", "Namibia", "Nepal", "Netherlands",
    "New Zealand", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan", "Panama", "Paraguay",
    "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
    "Saudi Arabia", "Senegal", "Serbia", "Singapore", "Slovakia", "Slovenia", "South Africa",
    "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland", "Taiwan", "Tanzania", "Thailand",
    "Tunisia", "Türkiye", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom",
    "United States", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam", "Zambia", "Zimbabwe",
  ]),
].sort((a, b) => a.localeCompare(b));

export function searchUniversities(
  query: string,
  extra: University[] = [],
  limit = 40
): University[] {
  const q = query.trim().toLowerCase();
  const all = [...UNIVERSITIES, ...extra];
  if (!q) return all.slice(0, limit);
  const scored = all
    .map((u) => {
      const name = u.name.toLowerCase();
      const where = `${u.city} ${u.country}`.toLowerCase();
      let score = -1;
      if (name.startsWith(q)) score = 0;
      else if (name.includes(` ${q}`)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (where.includes(q)) score = 3;
      return { u, score };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => a.score - b.score || a.u.name.localeCompare(b.u.name));
  return scored.slice(0, limit).map((s) => s.u);
}

/**
 * Country → Region lookup for rows that arrive without one (custom
 * universities — issue #15: the API hardcoded "Africa" for everything).
 * Built from the catalogue, then extended to cover countries the
 * catalogue lacks. Unknown names fall back to a geographic guess table
 * below — never silently "Africa".
 */
const DERIVED: Record<string, Region> = {};
for (const u of UNIVERSITIES) {
  if (!(u.country in DERIVED)) DERIVED[u.country] = u.region;
}

const EXTRA: Record<string, Region> = {
  // Africa
  "Algeria": "Africa", "Angola": "Africa", "Benin": "Africa",
  "Botswana": "Africa", "Burkina Faso": "Africa", "Burundi": "Africa",
  "Cameroon": "Africa", "Cape Verde": "Africa", "Chad": "Africa",
  "Comoros": "Africa", "Congo": "Africa", "DR Congo": "Africa",
  "Djibouti": "Africa", "Eritrea": "Africa", "Eswatini": "Africa",
  "Gabon": "Africa", "Gambia": "Africa", "Guinea": "Africa",
  "Ivory Coast": "Africa", "Lesotho": "Africa", "Liberia": "Africa",
  "Libya": "Africa", "Madagascar": "Africa", "Malawi": "Africa",
  "Mali": "Africa", "Mauritania": "Africa", "Mauritius": "Africa",
  "Morocco": "Africa", "Mozambique": "Africa", "Namibia": "Africa",
  "Niger": "Africa", "Rwanda": "Africa", "Senegal": "Africa",
  "Sierra Leone": "Africa", "Somalia": "Africa", "South Sudan": "Africa",
  "Sudan": "Africa", "Tanzania": "Africa", "Togo": "Africa",
  "Tunisia": "Africa", "Zambia": "Africa", "Zimbabwe": "Africa",
  // Asia
  "Afghanistan": "Asia", "Armenia": "Asia", "Azerbaijan": "Asia",
  "Bahrain": "Asia", "Bhutan": "Asia", "Cambodia": "Asia",
  "Georgia": "Asia", "Iraq": "Asia", "Kazakhstan": "Asia",
  "Kuwait": "Asia", "Kyrgyzstan": "Asia", "Laos": "Asia",
  "Mongolia": "Asia", "Myanmar": "Asia", "Nepal": "Asia",
  "North Korea": "Asia", "Oman": "Asia", "Pakistan": "Asia",
  "Philippines": "Asia", "Qatar": "Asia", "Saudi Arabia": "Asia",
  "Sri Lanka": "Asia", "Tajikistan": "Asia", "Turkmenistan": "Asia",
  "United Arab Emirates": "Asia", "Uzbekistan": "Asia",
  "Vietnam": "Asia", "Yemen": "Asia",
  // Europe
  "Albania": "Europe", "Belarus": "Europe", "Bosnia and Herzegovina": "Europe",
  "Bulgaria": "Europe", "Croatia": "Europe", "Cyprus": "Europe",
  "Estonia": "Europe", "Hungary": "Europe", "Iceland": "Europe",
  "Latvia": "Europe", "Lithuania": "Europe", "Luxembourg": "Europe",
  "Malta": "Europe", "Moldova": "Europe", "Montenegro": "Europe",
  "North Macedonia": "Europe", "Poland": "Europe", "Romania": "Europe",
  "Serbia": "Europe", "Slovakia": "Europe", "Ukraine": "Europe",
  // Middle East (subset of Asia kept distinct — the UI separates it)
  "Iran": "Middle East", "Palestine": "Middle East", "Syria": "Middle East",
  // North America
  "Belize": "North America", "Costa Rica": "North America",
  "Cuba": "North America", "Dominican Republic": "North America",
  "El Salvador": "North America", "Guatemala": "North America",
  "Haiti": "North America", "Honduras": "North America",
  "Jamaica": "North America", "Nicaragua": "North America",
  "Panama": "North America", "Puerto Rico": "North America",
  "Trinidad and Tobago": "North America",
  // Oceania
  "Fiji": "Oceania", "Papua New Guinea": "Oceania",
  // South America
  "Bolivia": "South America", "Ecuador": "South America",
  "Guyana": "South America", "Paraguay": "South America",
  "Suriname": "South America", "Uruguay": "South America",
};

/** Region for a country name; undefined when truly unmapped. */
export function regionForCountry(country: string): Region | undefined {
  return DERIVED[country] ?? EXTRA[country];
}
