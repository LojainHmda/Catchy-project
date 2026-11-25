// Catchy delivery regions: Catchy's own data, not a delivery provider's.
//
// Imported 2026-11-23 from a list of Palestinian delivery-area NAMES (snapshot 2026-09-30).
// No provider ids, codes, fees or credentials were imported.
//
// Shared by the server (guest checkout: validation + price) and the browser (checkout,
// admin). It lives under server/ because the production image ships only server/ and dist/.
//
// - `id` is Catchy's own stable id and is stored on orders: never rename or reuse one.
// - `defaultPrice` (ILS) is the starting delivery price. Admins change prices in
//   Admin -> Delivery prices (Firestore site_settings/delivery_prices), which wins over it.
// - Starting prices approved by the owner on 2026-11-23: Catchy's previous zone prices
//   (West Bank 20, Jerusalem 30, Abu Ghosh 50, 1948 areas 70); Jerusalem suburbs 30, Golan 70.

/** @typedef {{ id: string, nameAr: string, nameEn: string }} DeliveryGroup */
/**
 * @typedef {{
 *   id: string,
 *   nameAr: string,
 *   nameEn: string,
 *   groupId: string,
 *   kind: 'governorate' | 'city' | 'region',
 *   parentRegionId: string | null,
 *   defaultPrice: number,
 * }} DeliveryRegion
 */

/** @type {ReadonlyArray<DeliveryGroup>} */
export const DELIVERY_GROUPS = Object.freeze([
  { id: "west_bank", nameAr: "الضفة الغربية", nameEn: "West Bank" },
  { id: "jerusalem", nameAr: "القدس", nameEn: "Jerusalem" },
  { id: "inside_1948", nameAr: "الداخل (أراضي 48)", nameEn: "Inside the Green Line (1948 areas)" },
  { id: "golan", nameAr: "الجولان", nameEn: "Golan" },
]);

/** @type {ReadonlyArray<DeliveryRegion>} */
export const DELIVERY_REGIONS = Object.freeze([
  { id: "jericho", nameAr: "اريحا", nameEn: "Jericho", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "hebron", nameAr: "الخليل", nameEn: "Hebron", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "bethlehem", nameAr: "بيت لحم", nameEn: "Bethlehem", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "jenin", nameAr: "جنين", nameEn: "Jenin", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "ramallah-albireh", nameAr: "رام الله والبيرة", nameEn: "Ramallah & Al-Bireh", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "salfit", nameAr: "سلفيت", nameEn: "Salfit", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "tubas", nameAr: "طوباس", nameEn: "Tubas", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "tulkarm", nameAr: "طولكرم", nameEn: "Tulkarm", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "qalqilya", nameAr: "قلقيلية", nameEn: "Qalqilya", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "hebron-city", nameAr: "مدينة الخليل", nameEn: "Hebron (city)", groupId: "west_bank", kind: "city", parentRegionId: "hebron", defaultPrice: 20 },
  { id: "bethlehem-city", nameAr: "مدينة بيت لحم", nameEn: "Bethlehem (city)", groupId: "west_bank", kind: "city", parentRegionId: "bethlehem", defaultPrice: 20 },
  { id: "ramallah-albireh-city", nameAr: "مدينة رام الله والبيرة", nameEn: "Ramallah & Al-Bireh (city)", groupId: "west_bank", kind: "city", parentRegionId: "ramallah-albireh", defaultPrice: 20 },
  { id: "nablus", nameAr: "نابلس", nameEn: "Nablus", groupId: "west_bank", kind: "governorate", parentRegionId: null, defaultPrice: 20 },
  { id: "jerusalem", nameAr: "القدس", nameEn: "Jerusalem", groupId: "jerusalem", kind: "governorate", parentRegionId: null, defaultPrice: 30 },
  { id: "jerusalem-suburbs", nameAr: "ضواحي القدس", nameEn: "Jerusalem suburbs", groupId: "jerusalem", kind: "region", parentRegionId: null, defaultPrice: 30 },
  { id: "abu-ghosh", nameAr: "ابو غوش", nameEn: "Abu Ghosh", groupId: "inside_1948", kind: "region", parentRegionId: null, defaultPrice: 50 },
  { id: "galilee", nameAr: "الجليل", nameEn: "Galilee", groupId: "inside_1948", kind: "region", parentRegionId: null, defaultPrice: 70 },
  { id: "eastern-galilee", nameAr: "الجليل الشرقي", nameEn: "Eastern Galilee", groupId: "inside_1948", kind: "region", parentRegionId: null, defaultPrice: 70 },
  { id: "triangle", nameAr: "المثلث", nameEn: "Triangle", groupId: "inside_1948", kind: "region", parentRegionId: null, defaultPrice: 70 },
  { id: "center", nameAr: "المركز", nameEn: "Center", groupId: "inside_1948", kind: "region", parentRegionId: null, defaultPrice: 70 },
  { id: "beersheba-naqab", nameAr: "بئر السبع", nameEn: "Beersheba / Naqab", groupId: "inside_1948", kind: "region", parentRegionId: null, defaultPrice: 70 },
  { id: "golan", nameAr: "الجولان", nameEn: "Golan", groupId: "golan", kind: "region", parentRegionId: null, defaultPrice: 70 },
]);
