/**
 * Location options used across signup and onboarding.
 *
 * Covers all 28 states and 8 union territories with their districts. Only the
 * launch market (West Bengal) has a curated block list, so there the village
 * field is a dropdown; everywhere else it stays a free-text input with
 * suggestions, and grows into a dropdown as blocks get added.
 *
 * Values are stored as plain strings in `profiles.details` (and mirrored into
 * auth metadata): `state`, `district`, `village`.
 */

export type StateLocation = {
  name: string;
  districts: readonly string[];
  /** Block / gram panchayat names per district. Missing = free text. */
  blocks?: Record<string, readonly string[]>;
  /** Launch market — listed first in the dropdown. */
  launch?: boolean;
};

/** Block / municipal names for every West Bengal district. */
const WB_BLOCKS: Record<string, readonly string[]> = {
  Alipurduar: [
    "Alipurduar-I", "Alipurduar-II", "Falakata", "Kalchini", "Kumargram",
    "Madarihat-Birpara", "Alipurduar Municipality",
  ],
  Bankura: [
    "Bankura-I", "Bankura-II", "Barjora", "Chhatna", "Gangajalghati", "Indas",
    "Indpur", "Khatra", "Kotulpur", "Mejhia", "Onda", "Patrasayer",
    "Raipur", "Ranibandh", "Saltora", "Sarenga", "Simlapal", "Sonamukhi",
    "Taldangra", "Vishnupur", "Bankura Municipality",
  ],
  Birbhum: [
    "Bolpur-Sriniketan", "Dubrajpur", "Illambazar", "Khoyrasol", "Labpur",
    "Mayureswar-I", "Mayureswar-II", "Md. Bazar", "Murarai-I", "Murarai-II",
    "Nalhati-I", "Nalhati-II", "Nanoor", "Rajnagar", "Rampurhat-I",
    "Rampurhat-II", "Sainthia", "Suri-I", "Suri-II",
  ],
  "Cooch Behar": [
    "Cooch Behar-I", "Cooch Behar-II", "Dinhata-I", "Dinhata-II", "Mathabhanga-I",
    "Mathabhanga-II", "Mekhliganj", "Sitai", "Sitalkuchi", "Tufanganj-I",
    "Tufanganj-II",
  ],
  "Dakshin Dinajpur": [
    "Balurghat", "Bansihari", "Gangarampur", "Harirampur", "Hilli", "Kushmandi",
    "Kumarganj", "Tapan",
  ],
  Darjeeling: [
    "Darjeeling Sadar", "Jorebunglow-Sukhiapokhri", "Kurseong", "Mirik",
    "Naxalbari", "Phansidewa", "Kharibari", "Matigara", "Siliguri",
  ],
  Hooghly: [
    "Arambagh", "Balagarh", "Chanditala-I", "Chanditala-II", "Chinsurah-Mogra",
    "Dhaniakhali", "Goghat-I", "Goghat-II", "Haripal", "Jangipara", "Khanakul-I",
    "Khanakul-II", "Pandua", "Polba-Dadpur", "Pursurah", "Serampore-Uttarpara",
    "Singur", "Tarakeswar",
  ],
  Howrah: [
    "Amta-I", "Amta-II", "Bagnan-I", "Bagnan-II", "Bally-Jagacha", "Domjur",
    "Jagatballavpur", "Panchla", "Sankrail", "Shyampur-I", "Shyampur-II",
    "Udaynarayanpur", "Uluberia-I", "Uluberia-II",
  ],
  Jalpaiguri: [
    "Dhupguri", "Jalpaiguri Sadar", "Maynaguri", "Mal", "Matiali", "Nagrakata",
    "Rajganj",
  ],
  Jhargram: [
    "Binpur-I", "Binpur-II", "Gopiballavpur-I", "Gopiballavpur-II", "Jamboni",
    "Jhargram", "Nayagram", "Sankrail",
  ],
  Kalimpong: ["Kalimpong-I", "Kalimpong-II", "Gorubathan", "Lava-Gitdabling"],
  Kolkata: [
    "Borough I", "Borough II", "Borough III", "Borough IV", "Borough V",
    "Borough VI", "Borough VII", "Borough VIII", "Borough IX", "Borough X",
    "Borough XI", "Borough XII", "Borough XIII", "Borough XIV", "Borough XV",
    "Borough XVI",
  ],
  Malda: [
    "Bamongola", "Chanchal-I", "Chanchal-II", "English Bazar", "Gazole",
    "Habibpur", "Harishchandrapur-I", "Harishchandrapur-II", "Kaliachak-I",
    "Kaliachak-II", "Kaliachak-III", "Manikchak", "Old Malda", "Ratua-I",
    "Ratua-II",
  ],
  Murshidabad: [
    "Beldanga-I", "Beldanga-II", "Berhampore", "Bhagawangola-I", "Bhagawangola-II",
    "Bharatpur-I", "Bharatpur-II", "Burwan", "Domkal", "Farakka", "Hariharpara",
    "Jalangi", "Kandi", "Khargram", "Lalgola", "Murshidabad-Jiaganj",
    "Nabagram", "Nawda", "Raninagar-I", "Raninagar-II", "Raghunathganj-I",
    "Raghunathganj-II", "Sagardighi", "Samserganj", "Suti-I", "Suti-II",
  ],
  Nadia: [
    "Chapra", "Hanskhali", "Haringhata", "Kaliganj", "Kalyani", "Karimpur-I",
    "Karimpur-II", "Krishnagar-I", "Krishnagar-II", "Krishnanagar", "Nabadwip",
    "Nakashipara", "Ranaghat-I", "Ranaghat-II", "Santipur", "Tehatta-I",
    "Tehatta-II",
  ],
  "North 24 Parganas": [
    "Amdanga", "Baduria", "Bagda", "Barasat-I", "Barasat-II", "Barrackpore-I",
    "Barrackpore-II", "Basirhat-I", "Basirhat-II", "Bongaon", "Deganga",
    "Haroa", "Hasnabad", "Hingalganj", "Habra-I", "Habra-II", "Minakhan",
    "Rajah", "Sandeshkhali-I", "Sandeshkhali-II", "Swarupnagar",
  ],
  "Paschim Bardhaman": [
    "Andal", "Barabani", "Durgapur-Faridpur", "Jamuria", "Kanksa", "Ondal",
    "Pandabeswar", "Raniganj", "Salanpur",
  ],
  "Paschim Medinipur": [
    "Chandrakona-I", "Chandrakona-II", "Dantan-I", "Dantan-II", "Debra",
    "Garbeta-I", "Garbeta-II", "Garbeta-III", "Keshpur", "Kharagpur-I",
    "Kharagpur-II", "Midnapore Sadar", "Mohanpur", "Narayangarh", "Pingla",
    "Sabang", "Salboni", "Keshiary", "Daspur-I", "Daspur-II",
  ],
  "Purba Bardhaman": [
    "Ausgram-I", "Ausgram-II", "Bhatar", "Burdwan-I", "Burdwan-II",
    "Khandaghosh", "Manteswar", "Memari-I", "Memari-II", "Jamalpur",
    "Kalna-I", "Kalna-II", "Katwa-I", "Katwa-II", "Ketugram-I", "Ketugram-II",
    "Mongolkote", "Purbasthali-I", "Purbasthali-II", "Raina-I", "Raina-II",
  ],
  "Purba Medinipur": [
    "Bhagabanpur-I", "Bhagabanpur-II", "Chandipur", "Egra-I", "Egra-II",
    "Haldia", "Khejuri-I", "Khejuri-II", "Kolaghat", "Mahishadal", "Moyna",
    "Nandakumar", "Nandigram-I", "Nandigram-II", "Panskura-I", "Panskura-II",
    "Patashpur-I", "Patashpur-II", "Ramnagar-I", "Ramnagar-II", "Sutahata",
    "Tamluk",
  ],
  Purulia: [
    "Arsha", "Baghmundi", "Balarampur", "Barabazar", "Hura", "Jaipur", "Jhalda-I",
    "Jhalda-II", "Kashipur", "Manbazar-I", "Manbazar-II", "Neturia",
    "Para", "Puncha", "Purulia-I", "Purulia-II", "Raghunathpur-I",
    "Raghunathpur-II", "Santuri",
  ],
  "South 24 Parganas": [
    "Baruipur", "Basanti", "Bhangar-I", "Bhangar-II", "Bishnupur-I",
    "Bishnupur-II", "Budge-Budge", "Canning-I", "Canning-II", "Diamond Harbour-I",
    "Diamond Harbour-II", "Falta", "Gosaba", "Jaynagar-I", "Jaynagar-II",
    "Kakdwip", "Kultali", "Magrahat-I", "Magrahat-II", "Mandirbazar",
    "Mathurapur-I", "Mathurapur-II", "Namkhana", "Patharpratima", "Sagar",
    "Sonarpur", "Thakurpukur-Maheshtala",
  ],
  "Uttar Dinajpur": [
    "Chopra", "Goalpokhar-I", "Goalpokhar-II", "Hemtabad", "Islampur",
    "Itahar", "Kaliaganj", "Karandighi", "Raiganj",
  ],
};

export const STATES: readonly StateLocation[] = [
  {
    name: "West Bengal",
    launch: true,
    districts: Object.keys(WB_BLOCKS).sort((a, b) => a.localeCompare(b)),
    blocks: WB_BLOCKS,
  },
  {
    name: "Bihar",
    districts: [
      "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur",
      "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj",
      "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj",
      "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur",
      "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur",
      "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul",
      "Vaishali", "West Champaran",
    ],
  },
  {
    name: "Jharkhand",
    districts: [
      "Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum",
      "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara",
      "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu",
      "Ramgarh", "Ranchi", "Sahibganj", "Seraikela-Kharsawan", "Simdega",
      "West Singhbhum",
    ],
  },
  {
    name: "Odisha",
    districts: [
      "Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack",
      "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur",
      "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar",
      "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur",
      "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur",
      "Sundargarh",
    ],
  },
  {
    name: "Assam",
    districts: [
      "Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo",
      "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao",
      "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup",
      "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar",
      "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari", "Sivasagar",
      "Sonitpur", "South Salmara-Mankachar", "Tinsukia", "Udalguri",
      "West Karbi Anglong",
    ],
  },
  {
    name: "Sikkim",
    districts: ["Gangtok", "Gyalshing", "Mangan", "Namchi", "Pakyong", "Soreng"],
  },
  {
    name: "Tripura",
    districts: [
      "Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala",
      "South Tripura", "Unakoti", "West Tripura",
    ],
  },
  {
    name: "Andhra Pradesh",
    districts: [
      "Alluri Sitharama Raju", "Anakapalli", "Anantapur", "Annamayya",
      "Bapatla", "Chittoor", "Dr. B.R. Ambedkar Konaseema", "East Godavari",
      "Eluru", "Guntur", "Kakinada", "Krishna", "Kurnool", "Nandyal",
      "NTR", "Palnadu", "Parvathipuram Manyam", "Prakasam", "Sri Potti Sriramulu Nellore",
      "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam",
      "Vizianagaram", "West Godavari", "YSR Kadapa",
    ],
  },
  {
    name: "Arunachal Pradesh",
    districts: [
      "Anjaw", "Changlang", "Dibang Valley", "East Kameng", "East Siang",
      "Kamle", "Kra Daadi", "Kurung Kumey", "Lepa Rada", "Lohit",
      "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri",
      "Namsai", "Pakke Kessang", "Papum Pare", "Shi Yomi", "Siang",
      "Tawang", "Tirap", "Upper Siang", "Upper Subansiri", "West Kameng",
      "West Siang",
    ],
  },
  {
    name: "Chhattisgarh",
    districts: [
      "Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur",
      "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariaband", "Gaurela-Pendra-Marwahi",
      "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Khairagarh",
      "Kondagaon", "Korba", "Koriya", "Mahasamund", "Manendragarh-Chirmiri-Bharatpur",
      "Mohla-Manpur-Ambagarh Chowki", "Mungeli", "Narayanpur", "Raigarh",
      "Raipur", "Rajnandgaon", "Sakti", "Sarangarh-Bilaigarh", "Sukma",
      "Surajpur", "Surguja",
    ],
  },
  {
    name: "Goa",
    districts: ["North Goa", "South Goa"],
  },
  {
    name: "Gujarat",
    districts: [
      "Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch",
      "Bhavnagar", "Botad", "Chhota Udaipur", "Dahod", "Dang", "Devbhoomi Dwarka",
      "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch",
      "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal",
      "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar",
      "Tapi", "Vadodara", "Valsad",
    ],
  },
  {
    name: "Haryana",
    districts: [
      "Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad",
      "Gurugram", "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal",
      "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula",
      "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar",
    ],
  },
  {
    name: "Himachal Pradesh",
    districts: [
      "Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu",
      "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una",
    ],
  },
  {
    name: "Karnataka",
    districts: [
      "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
      "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga",
      "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan",
      "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya",
      "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru",
      "Udupi", "Uttara Kannada", "Vijayanagara", "Yadgir",
    ],
  },
  {
    name: "Kerala",
    districts: [
      "Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam",
      "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta",
      "Thiruvananthapuram", "Thrissur", "Wayanad",
    ],
  },
  {
    name: "Madhya Pradesh",
    districts: [
      "Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat",
      "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur", "Chhatarpur",
      "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori",
      "Guna", "Gwalior", "Harda", "Narmadapuram", "Indore", "Jabalpur",
      "Jhabua", "Katni", "Khandwa", "Khargone", "Maihar", "Mandla",
      "Mandsaur", "Morena", "Narsinghpur", "Neemuch", "Niwari", "Panna",
      "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore",
      "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi",
      "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha", "Mauganj",
      "Pandhurna",
    ],
  },
  {
    name: "Maharashtra",
    districts: [
      "Ahmednagar", "Akola", "Amravati", "Aurangabad (Chhatrapati Sambhajinagar)",
      "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli",
      "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur",
      "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar",
      "Nashik", "Osmanabad (Dharashiv)", "Palghar", "Parbhani", "Pune",
      "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur",
      "Thane", "Wardha", "Washim", "Yavatmal",
    ],
  },
  {
    name: "Manipur",
    districts: [
      "Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West",
      "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl",
      "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul",
    ],
  },
  {
    name: "Meghalaya",
    districts: [
      "East Garo Hills", "East Jaintia Hills", "East Khasi Hills",
      "Eastern West Khasi Hills", "North Garo Hills", "Ri Bhoi",
      "South Garo Hills", "South West Garo Hills", "South West Khasi Hills",
      "West Garo Hills", "West Jaintia Hills", "West Khasi Hills",
    ],
  },
  {
    name: "Mizoram",
    districts: [
      "Aizawl", "Champhai", "Hnahthial", "Khawzawl", "Kolasib", "Lawngtlai",
      "Lunglei", "Mamit", "Saiha", "Saitual", "Serchhip",
    ],
  },
  {
    name: "Nagaland",
    districts: [
      "Chümoukedima", "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung",
      "Mon", "Niuland", "Noklak", "Peren", "Phek", "Shamator",
      "Tseminyü", "Tuensang", "Wokha", "Zunheboto",
    ],
  },
  {
    name: "Punjab",
    districts: [
      "Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib",
      "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar",
      "Kapurthala", "Ludhiana", "Malerkotla", "Mansa", "Moga",
      "Pathankot", "Patiala", "Rupnagar", "Sahibzada Ajit Singh Nagar",
      "Sangrur", "Shahid Bhagat Singh Nagar", "Sri Muktsar Sahib", "Tarn Taran",
    ],
  },
  {
    name: "Rajasthan",
    districts: [
      "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur",
      "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa",
      "Dholpur", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer",
      "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kota",
      "Nagaur", "Pali", "Pratapgarh", "Rajsamand", "Sawai Madhopur",
      "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur",
    ],
  },
  {
    name: "Tamil Nadu",
    districts: [
      "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore",
      "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kanchipuram",
      "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai",
      "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai",
      "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi",
      "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli",
      "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur",
      "Vellore", "Viluppuram", "Virudhunagar",
    ],
  },
  {
    name: "Telangana",
    districts: [
      "Adilabad", "Bhadradri Kothagudem", "Hanumakonda", "Hyderabad",
      "Jagtial", "Jangaon", "Jayashankar Bhupalpally", "Jogulamba Gadwal",
      "Kamareddy", "Karimnagar", "Khammam", "Kumuram Bheem Asifabad",
      "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak",
      "Medchal-Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet",
      "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Rangareddy",
      "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy",
      "Warangal", "Yadadri Bhuvanagiri",
    ],
  },
  {
    name: "Uttar Pradesh",
    districts: [
      "Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya",
      "Ayodhya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur",
      "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor",
      "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah",
      "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar",
      "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur",
      "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj",
      "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri",
      "Kushinagar", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba",
      "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad",
      "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj", "Raebareli",
      "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar",
      "Shahjahanpur", "Shamli", "Shravasti", "Siddharthnagar", "Sitapur",
      "Sonbhadra", "Sultanpur", "Unnao", "Varanasi",
    ],
  },
  {
    name: "Uttarakhand",
    districts: [
      "Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun",
      "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag",
      "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi",
    ],
  },
  {
    name: "Andaman and Nicobar Islands",
    districts: ["Nicobar", "North and Middle Andaman", "South Andaman"],
  },
  {
    name: "Chandigarh",
    districts: ["Chandigarh"],
  },
  {
    name: "Dadra and Nagar Haveli and Daman and Diu",
    districts: ["Dadra and Nagar Haveli", "Daman", "Diu"],
  },
  {
    name: "Delhi",
    districts: [
      "Central Delhi", "East Delhi", "New Delhi", "North Delhi",
      "North East Delhi", "North West Delhi", "Shahdara", "South Delhi",
      "South East Delhi", "South West Delhi", "West Delhi",
    ],
  },
  {
    name: "Jammu and Kashmir",
    districts: [
      "Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal",
      "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch",
      "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian",
      "Srinagar", "Udhampur",
    ],
  },
  {
    name: "Ladakh",
    districts: ["Kargil", "Leh"],
  },
  {
    name: "Lakshadweep",
    districts: ["Lakshadweep"],
  },
  {
    name: "Puducherry",
    districts: ["Karaikal", "Mahe", "Puducherry", "Yanam"],
  },
];

/** Union territories, kept separate so the dropdown can group them. */
export const UNION_TERRITORIES: readonly string[] = [
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const alphabetically = (a: string, b: string) => a.localeCompare(b);

/**
 * State names for the dropdown, grouped:
 * `launch` (pinned first) → `states` → `unionTerritories`, each alphabetical.
 */
export const STATE_NAMES = {
  launch: STATES.filter((s) => s.launch)
    .map((s) => s.name)
    .sort(alphabetically),
  states: STATES.filter(
    (s) => !s.launch && !UNION_TERRITORIES.includes(s.name)
  )
    .map((s) => s.name)
    .sort(alphabetically),
  unionTerritories: STATES.filter((s) => UNION_TERRITORIES.includes(s.name))
    .map((s) => s.name)
    .sort(alphabetically),
};

/** True for the 8 union territories (so labels can say "State / UT"). */
export function isUnionTerritory(state: string | null | undefined): boolean {
  return Boolean(state && UNION_TERRITORIES.includes(state));
}

/** Districts for a state (empty when the state is not chosen yet). */
export function districtsOf(state: string | null | undefined): readonly string[] {
  if (!state) return [];
  return STATES.find((s) => s.name === state)?.districts ?? [];
}

/**
 * Block / gram panchayat options for a state + district.
 * Returns `null` when we have no curated list — callers should fall back to a
 * free-text village input so nobody is blocked.
 */
export function blocksOf(
  state: string | null | undefined,
  district: string | null | undefined
): readonly string[] | null {
  if (!state || !district) return null;
  const blocks = STATES.find((s) => s.name === state)?.blocks?.[district];
  return blocks ?? null;
}

/** True when the village field should be a `<select>` instead of free text. */
export function hasBlockList(state?: string | null, district?: string | null): boolean {
  const blocks = blocksOf(state, district);
  return Boolean(blocks && blocks.length > 0);
}

/** One-line label used in dashboards: "Village, District, State". */
export function formatLocation(details?: Record<string, string> | null): string {
  if (!details) return "";
  return [details.village, details.district, details.state].filter(Boolean).join(", ");
}
