/**
 * Screen-wide translation layer for the staff / admin screens (and any leftover English text).
 * When the language is Kannada or Hindi, every text node and placeholder whose text EXACTLY matches a known
 * English UI phrase is replaced by its translation. Names, numbers and data are never touched (no partial
 * matches). Switching back to English restores the originals.
 * Mark an element with data-no-translate to opt it out.
 */
import { useAuth } from '../store/auth';

type L = 'kn' | 'hi';

// [English, Kannada, Hindi]
const PHRASES: [string, string, string][] = [
  // ---- Navigation / roles ----
  ['Dashboard', 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', 'डैशबोर्ड'],
  ['Home', 'ಮುಖಪುಟ', 'होम'],
  ['Patients', 'ರೋಗಿಗಳು', 'मरीज़'],
  ['Patient', 'ರೋಗಿ', 'मरीज़'],
  ['My patients', 'ನನ್ನ ರೋಗಿಗಳು', 'मेरे मरीज़'],
  ['Alerts', 'ಎಚ್ಚರಿಕೆಗಳು', 'अलर्ट'],
  ['All alerts', 'ಎಲ್ಲಾ ಎಚ್ಚರಿಕೆಗಳು', 'सभी अलर्ट'],
  ['Reminder calls', 'ನೆನಪಿನ ಕರೆಗಳು', 'रिमाइंडर कॉल'],
  ['Doctor calls', 'ವೈದ್ಯರ ಕರೆಗಳು', 'डॉक्टर कॉल'],
  ['Video calls', 'ವಿಡಿಯೋ ಕರೆಗಳು', 'वीडियो कॉल'],
  ['Scan medicine', 'ಔಷಧಿ ಸ್ಕ್ಯಾನ್', 'दवा स्कैन'],
  ['Scan', 'ಸ್ಕ್ಯಾನ್', 'स्कैन'],
  ['Jan Aushadhi', 'ಜನ ಔಷಧಿ', 'जन औषधि'],
  ['Prescriptions', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ಗಳು', 'पर्चे'],
  ['Reports', 'ವರದಿಗಳು', 'रिपोर्ट'],
  ['Users', 'ಬಳಕೆದಾರರು', 'उपयोगकर्ता'],
  ['Readings', 'ಅಳತೆಗಳು', 'रीडिंग'],
  ['Pharmacy', 'ಔಷಧಾಲಯ', 'फ़ार्मेसी'],
  ['Medicines', 'ಔಷಧಿಗಳು', 'दवाएँ'],
  ['History', 'ಇತಿಹಾಸ', 'इतिहास'],
  ['Refills', 'ರೀಫಿಲ್', 'रीफ़िल'],
  ['Today', 'ಇಂದು', 'आज'],
  ['Ask', 'ಕೇಳಿ', 'पूछें'],
  ['Doctor', 'ವೈದ್ಯರು', 'डॉक्टर'],
  ['Doctors', 'ವೈದ್ಯರು', 'डॉक्टर'],
  ['Caregiver', 'ಆರೈಕೆದಾರ', 'देखभालकर्ता'],
  ['Caregivers', 'ಆರೈಕೆದಾರರು', 'देखभालकर्ता'],
  ['ASHA worker', 'ಆಶಾ ಕಾರ್ಯಕರ್ತೆ', 'आशा कार्यकर्ता'],
  ['ASHA workers', 'ಆಶಾ ಕಾರ್ಯಕರ್ತೆಯರು', 'आशा कार्यकर्ता'],
  ['Admin', 'ನಿರ್ವಾಹಕ', 'एडमिन'],
  ['Admins', 'ನಿರ್ವಾಹಕರು', 'एडमिन'],
  ['Main', 'ಮುಖ್ಯ', 'मुख्य'],

  // ---- Dashboards ----
  ['ASHA dashboard', 'ಆಶಾ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', 'आशा डैशबोर्ड'],
  ['Doctor dashboard', 'ವೈದ್ಯರ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', 'डॉक्टर डैशबोर्ड'],
  ['Caregiver dashboard', 'ಆರೈಕೆದಾರರ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', 'देखभालकर्ता डैशबोर्ड'],
  ['System overview', 'ವ್ಯವಸ್ಥೆಯ ಅವಲೋಕನ', 'सिस्टम अवलोकन'],
  ['Patients sorted by Medication Safety Score (riskiest first)', 'ಔಷಧ ಸುರಕ್ಷತಾ ಅಂಕದ ಪ್ರಕಾರ ರೋಗಿಗಳು (ಹೆಚ್ಚು ಅಪಾಯದವರು ಮೊದಲು)', 'दवा सुरक्षा स्कोर के अनुसार मरीज़ (सबसे जोखिम वाले पहले)'],
  ['Review adherence and warnings before making clinical decisions', 'ಚಿಕಿತ್ಸಾ ನಿರ್ಧಾರಕ್ಕೆ ಮೊದಲು ಪಾಲನೆ ಮತ್ತು ಎಚ್ಚರಿಕೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ', 'इलाज का निर्णय लेने से पहले पालन और चेतावनियाँ देखें'],
  ['Total patients', 'ಒಟ್ಟು ರೋಗಿಗಳು', 'कुल मरीज़'],
  ['Patients at risk', 'ಅಪಾಯದಲ್ಲಿರುವ ರೋಗಿಗಳು', 'जोखिम वाले मरीज़'],
  ['Missed doses today', 'ಇಂದು ತಪ್ಪಿದ ಡೋಸ್‌ಗಳು', 'आज छूटी खुराक'],
  ['Refill warnings', 'ರೀಫಿಲ್ ಎಚ್ಚರಿಕೆಗಳು', 'रीफ़िल चेतावनी'],
  ['Need follow-up', 'ಅನುಸರಣೆ ಬೇಕು', 'फ़ॉलो-अप ज़रूरी'],
  ['Open alerts', 'ತೆರೆದ ಎಚ್ಚರಿಕೆಗಳು', 'खुले अलर्ट'],
  ['Open alerts for you', 'ನಿಮಗಾಗಿ ತೆರೆದ ಎಚ್ಚರಿಕೆಗಳು', 'आपके लिए खुले अलर्ट'],
  ['Open alerts by type', 'ಬಗೆಯ ಪ್ರಕಾರ ತೆರೆದ ಎಚ್ಚರಿಕೆಗಳು', 'प्रकार के अनुसार खुले अलर्ट'],
  ['Users by role', 'ಪಾತ್ರದ ಪ್ರಕಾರ ಬಳಕೆದಾರರು', 'भूमिका के अनुसार उपयोगकर्ता'],
  ['Doses — all patients, last 14 days', 'ಡೋಸ್‌ಗಳು — ಎಲ್ಲಾ ರೋಗಿಗಳು, ಕಳೆದ 14 ದಿನ', 'खुराक — सभी मरीज़, पिछले 14 दिन'],
  ['Demo clock', 'ಡೆಮೊ ಗಡಿಯಾರ', 'डेमो घड़ी'],
  ['Reset to real time', 'ನಿಜವಾದ ಸಮಯಕ್ಕೆ ಮರಳಿ', 'असली समय पर लौटें'],
  ['You will be alerted if a dose is missed. Never give an extra dose — ask the doctor if unsure.', 'ಡೋಸ್ ತಪ್ಪಿದರೆ ನಿಮಗೆ ಎಚ್ಚರಿಕೆ ಬರುತ್ತದೆ. ಹೆಚ್ಚುವರಿ ಡೋಸ್ ಕೊಡಬೇಡಿ — ಸಂಶಯವಿದ್ದರೆ ವೈದ್ಯರನ್ನು ಕೇಳಿ.', 'खुराक छूटने पर आपको अलर्ट मिलेगा। अतिरिक्त खुराक कभी न दें — संदेह हो तो डॉक्टर से पूछें।'],

  // ---- Patient table / filters ----
  ['All', 'ಎಲ್ಲಾ', 'सभी'],
  ['High risk', 'ಹೆಚ್ಚು ಅಪಾಯ', 'उच्च जोखिम'],
  ['Missed doses', 'ತಪ್ಪಿದ ಡೋಸ್‌ಗಳು', 'छूटी खुराक'],
  ['Refill needed', 'ರೀಫಿಲ್ ಬೇಕು', 'रीफ़िल चाहिए'],
  ['BP', 'ಬಿಪಿ', 'बीपी'],
  ['Diabetes', 'ಮಧುಮೇಹ', 'मधुमेह'],
  ['BP + Diabetes', 'ಬಿಪಿ + ಮಧುಮೇಹ', 'बीपी + मधुमेह'],
  ['Diabetes + BP', 'ಮಧುಮೇಹ + ಬಿಪಿ', 'मधुमेह + बीपी'],
  ['Search name or village', 'ಹೆಸರು ಅಥವಾ ಊರು ಹುಡುಕಿ', 'नाम या गाँव खोजें'],
  ['Search patients', 'ರೋಗಿಗಳನ್ನು ಹುಡುಕಿ', 'मरीज़ खोजें'],
  ['Filter patients', 'ರೋಗಿಗಳನ್ನು ಶೋಧಿಸಿ', 'मरीज़ छाँटें'],
  ['Condition', 'ಸ್ಥಿತಿ', 'बीमारी'],
  ['Conditions', 'ಸ್ಥಿತಿಗಳು', 'बीमारियाँ'],
  ['Adherence', 'ಪಾಲನೆ', 'पालन'],
  ['Adherence (7d)', 'ಪಾಲನೆ (7 ದಿನ)', 'पालन (7 दिन)'],
  ['Missed (7d)', 'ತಪ್ಪಿದ್ದು (7 ದಿನ)', 'छूटी (7 दिन)'],
  ['Refill', 'ರೀಫಿಲ್', 'रीफ़िल'],
  ['Safety score', 'ಸುರಕ್ಷತಾ ಅಂಕ', 'सुरक्षा स्कोर'],
  ['Medication Safety Score', 'ಔಷಧ ಸುರಕ್ಷತಾ ಅಂಕ', 'दवा सुरक्षा स्कोर'],
  ['Risk', 'ಅಪಾಯ', 'जोखिम'],
  ['High', 'ಹೆಚ್ಚು', 'उच्च'],
  ['Medium', 'ಮಧ್ಯಮ', 'मध्यम'],
  ['Low', 'ಕಡಿಮೆ', 'कम'],
  ['No patients match this filter', 'ಈ ಶೋಧಕ್ಕೆ ಯಾವ ರೋಗಿಯೂ ಇಲ್ಲ', 'इस फ़िल्टर में कोई मरीज़ नहीं'],
  ['Filter by risk, missed doses, refills or condition. Click a name for full details.', 'ಅಪಾಯ, ತಪ್ಪಿದ ಡೋಸ್, ರೀಫಿಲ್ ಅಥವಾ ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ಶೋಧಿಸಿ. ಪೂರ್ಣ ವಿವರಕ್ಕೆ ಹೆಸರನ್ನು ಒತ್ತಿ.', 'जोखिम, छूटी खुराक, रीफ़िल या बीमारी से छाँटें। पूरी जानकारी के लिए नाम दबाएँ।'],
  ['Full details', 'ಪೂರ್ಣ ವಿವರ', 'पूरी जानकारी'],
  ['Details', 'ವಿವರ', 'विवरण'],
  ['Village', 'ಊರು', 'गाँव'],
  ['Name', 'ಹೆಸರು', 'नाम'],
  ['Full name', 'ಪೂರ್ಣ ಹೆಸರು', 'पूरा नाम'],
  ['Age', 'ವಯಸ್ಸು', 'उम्र'],
  ['Gender', 'ಲಿಂಗ', 'लिंग'],
  ['Female', 'ಮಹಿಳೆ', 'महिला'],
  ['Male', 'ಪುರುಷ', 'पुरुष'],
  ['Other', 'ಇತರೆ', 'अन्य'],
  ['Mobile', 'ಮೊಬೈಲ್', 'मोबाइल'],
  ['Mobile (optional)', 'ಮೊಬೈಲ್ (ಐಚ್ಛಿಕ)', 'मोबाइल (वैकल्पिक)'],
  ['Caregiver (optional)', 'ಆರೈಕೆದಾರ (ಐಚ್ಛಿಕ)', 'देखभालकर्ता (वैकल्पिक)'],
  ['None', 'ಯಾರೂ ಇಲ್ಲ', 'कोई नहीं'],
  ['Add patient', 'ರೋಗಿಯನ್ನು ಸೇರಿಸಿ', 'मरीज़ जोड़ें'],
  ['New patient', 'ಹೊಸ ರೋಗಿ', 'नया मरीज़'],
  ['Patient added', 'ರೋಗಿಯನ್ನು ಸೇರಿಸಲಾಗಿದೆ', 'मरीज़ जोड़ा गया'],

  // ---- Alerts ----
  ['Acknowledge', 'ಸ್ವೀಕರಿಸಿ', 'स्वीकार करें'],
  ['Acknowledged', 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ', 'स्वीकार किया'],
  ['Resolve', 'ಪರಿಹರಿಸಿ', 'हल करें'],
  ['Resolved', 'ಪರಿಹರಿಸಲಾಗಿದೆ', 'हल हुआ'],
  ['open', 'ತೆರೆದಿದೆ', 'खुला'],
  ['acknowledged', 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ', 'स्वीकृत'],
  ['resolved', 'ಪರಿಹರಿಸಲಾಗಿದೆ', 'हल'],
  ['No alerts', 'ಯಾವುದೇ ಎಚ್ಚರಿಕೆ ಇಲ್ಲ', 'कोई अलर्ट नहीं'],
  ['Missed dose', 'ತಪ್ಪಿದ ಡೋಸ್', 'छूटी खुराक'],
  ['Repeated misses', 'ಪದೇ ಪದೇ ತಪ್ಪುವಿಕೆ', 'बार-बार छूटना'],
  ['Prescription warning', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಎಚ್ಚರಿಕೆ', 'पर्चा चेतावनी'],
  ['HELP pressed', 'ಸಹಾಯ ಒತ್ತಲಾಗಿದೆ', 'मदद दबाया गया'],
  ['Health reading', 'ಆರೋಗ್ಯ ಅಳತೆ', 'स्वास्थ्य रीडिंग'],
  ['Doctor call', 'ವೈದ್ಯರ ಕರೆ', 'डॉक्टर कॉल'],
  ['SMS / WhatsApp', 'SMS / ವಾಟ್ಸ್‌ಆ್ಯಪ್', 'SMS / व्हाट्सऐप'],
  ['Hide message', 'ಸಂದೇಶ ಮರೆಮಾಡಿ', 'संदेश छिपाएँ'],
  ['All types', 'ಎಲ್ಲಾ ಬಗೆ', 'सभी प्रकार'],
  ['Type', 'ಬಗೆ', 'प्रकार'],
  ['Status', 'ಸ್ಥಿತಿ', 'स्थिति'],
  ['Help requests', 'ಸಹಾಯ ವಿನಂತಿಗಳು', 'मदद अनुरोध'],
  ['Recent alerts', 'ಇತ್ತೀಚಿನ ಎಚ್ಚರಿಕೆಗಳು', 'हाल के अलर्ट'],
  ['Safety alerts', 'ಸುರಕ್ಷತಾ ಎಚ್ಚರಿಕೆಗಳು', 'सुरक्षा अलर्ट'],
  ['Missed doses, repeated misses, refills, prescription warnings and help requests', 'ತಪ್ಪಿದ ಡೋಸ್, ಪದೇ ಪದೇ ತಪ್ಪುವಿಕೆ, ರೀಫಿಲ್, ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಎಚ್ಚರಿಕೆ ಮತ್ತು ಸಹಾಯ ವಿನಂತಿಗಳು', 'छूटी खुराक, बार-बार छूटना, रीफ़िल, पर्चा चेतावनी और मदद अनुरोध'],
  ['Notifications', 'ಅಧಿಸೂಚನೆಗಳು', 'सूचनाएँ'],
  ['No notifications yet', 'ಇನ್ನೂ ಅಧಿಸೂಚನೆ ಇಲ್ಲ', 'अभी कोई सूचना नहीं'],
  ['Mark all read', 'ಎಲ್ಲಾ ಓದಲಾಗಿದೆ', 'सब पढ़ा हुआ'],

  // ---- Patient detail ----
  ['Back', 'ಹಿಂದೆ', 'वापस'],
  ['Care team', 'ಆರೈಕೆ ತಂಡ', 'देखभाल टीम'],
  ['Call', 'ಕರೆ', 'कॉल'],
  ['Call patient', 'ರೋಗಿಗೆ ಕರೆ ಮಾಡಿ', 'मरीज़ को कॉल करें'],
  ['Request help', 'ಸಹಾಯ ಕೇಳಿ', 'मदद माँगें'],
  ['Medicine stock', 'ಔಷಧಿ ದಾಸ್ತಾನು', 'दवा स्टॉक'],
  ['Current medicines', 'ಈಗಿನ ಔಷಧಿಗಳು', 'मौजूदा दवाएँ'],
  ["Today's medication timeline", 'ಇಂದಿನ ಔಷಧ ಸಮಯಪಟ್ಟಿ', 'आज की दवा समय-सारणी'],
  ['Recent doses', 'ಇತ್ತೀಚಿನ ಡೋಸ್‌ಗಳು', 'हाल की खुराक'],
  ['Adherence trend', 'ಪಾಲನೆಯ ಪ್ರವೃತ್ತಿ', 'पालन का रुझान'],
  ['Adherence (last 14 days)', 'ಪಾಲನೆ (ಕಳೆದ 14 ದಿನ)', 'पालन (पिछले 14 दिन)'],
  ['Taken and missed doses per day', 'ದಿನಕ್ಕೆ ತೆಗೆದುಕೊಂಡ ಮತ್ತು ತಪ್ಪಿದ ಡೋಸ್‌ಗಳು', 'प्रतिदिन ली और छूटी खुराक'],
  ['Doses today (taken / missed / due)', 'ಇಂದಿನ ಡೋಸ್ (ತೆಗೆದುಕೊಂಡದ್ದು / ತಪ್ಪಿದ್ದು / ಬಾಕಿ)', 'आज की खुराक (ली / छूटी / बाकी)'],
  ['Prescription conflicts', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸಂಘರ್ಷಗಳು', 'पर्चों में टकराव'],
  ['Prescription warnings', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಎಚ್ಚರಿಕೆಗಳು', 'पर्चा चेतावनियाँ'],
  ['No prescription warnings', 'ಯಾವುದೇ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಎಚ್ಚರಿಕೆ ಇಲ್ಲ', 'कोई पर्चा चेतावनी नहीं'],
  ['Warnings to verify', 'ಪರಿಶೀಲಿಸಬೇಕಾದ ಎಚ್ಚರಿಕೆಗಳು', 'जाँचने योग्य चेतावनियाँ'],
  ['Starts at 100. Each factor below shows exactly how many points it removed.', '100 ರಿಂದ ಆರಂಭ. ಕೆಳಗಿನ ಪ್ರತಿಯೊಂದು ಅಂಶ ಎಷ್ಟು ಅಂಕ ಕಳೆದಿದೆ ಎಂದು ತೋರಿಸುತ್ತದೆ.', '100 से शुरू। नीचे हर कारण बताता है कि कितने अंक घटे।'],
  ['Weekly report (PDF)', 'ವಾರದ ವರದಿ (PDF)', 'साप्ताहिक रिपोर्ट (PDF)'],
  ['Doctor video call', 'ವೈದ್ಯರ ವಿಡಿಯೋ ಕರೆ', 'डॉक्टर वीडियो कॉल'],
  ['Follow-up report', 'ಅನುಸರಣಾ ವರದಿ', 'फ़ॉलो-अप रिपोर्ट'],
  ['Health readings (BP, sugar…)', 'ಆರೋಗ್ಯ ಅಳತೆಗಳು (ಬಿಪಿ, ಸಕ್ಕರೆ…)', 'स्वास्थ्य रीडिंग (बीपी, शुगर…)'],
  ['Health readings', 'ಆರೋಗ್ಯ ಅಳತೆಗಳು', 'स्वास्थ्य रीडिंग'],
  ['No doses scheduled today', 'ಇಂದು ಯಾವುದೇ ಡೋಸ್ ಇಲ್ಲ', 'आज कोई खुराक नहीं'],
  ['No doses scheduled today.', 'ಇಂದು ಯಾವುದೇ ಡೋಸ್ ಇಲ್ಲ.', 'आज कोई खुराक नहीं।'],
  ['Help with these doses', 'ಈ ಡೋಸ್‌ಗಳಿಗೆ ಸಹಾಯ ಮಾಡಿ', 'इन खुराकों में मदद करें'],
  ['taken today', 'ಇಂದು ತೆಗೆದುಕೊಂಡದ್ದು', 'आज ली'],
  ['doses taken', 'ಡೋಸ್ ತೆಗೆದುಕೊಂಡದ್ದು', 'खुराक ली'],

  // ---- Prescriptions ----
  ['Prescription management', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ನಿರ್ವಹಣೆ', 'पर्चा प्रबंधन'],
  ['Add prescription', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸೇರಿಸಿ', 'पर्चा जोड़ें'],
  ['Choose a patient to manage prescriptions', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ನಿರ್ವಹಿಸಲು ರೋಗಿಯನ್ನು ಆರಿಸಿ', 'पर्चे सँभालने के लिए मरीज़ चुनें'],
  ['New prescriptions are checked for duplicates, shared ingredients and timing conflicts before saving.', 'ಉಳಿಸುವ ಮೊದಲು ಹೊಸ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ಗಳನ್ನು ನಕಲು, ಒಂದೇ ಘಟಕ ಮತ್ತು ಸಮಯ ಸಂಘರ್ಷಕ್ಕಾಗಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತದೆ.', 'सेव करने से पहले नए पर्चों में दोहराव, समान घटक और समय टकराव की जाँच होती है।'],
  ['Medicine', 'ಔಷಧಿ', 'दवा'],
  ['Dosage', 'ಪ್ರಮಾಣ', 'मात्रा'],
  ['Dosage (e.g. 500mg)', 'ಪ್ರಮಾಣ (ಉದಾ. 500mg)', 'मात्रा (जैसे 500mg)'],
  ['How often', 'ಎಷ್ಟು ಬಾರಿ', 'कितनी बार'],
  ['Once a day (OD)', 'ದಿನಕ್ಕೆ ಒಮ್ಮೆ (OD)', 'दिन में एक बार (OD)'],
  ['Twice a day (BD)', 'ದಿನಕ್ಕೆ ಎರಡು ಬಾರಿ (BD)', 'दिन में दो बार (BD)'],
  ['Three times a day (TDS)', 'ದಿನಕ್ಕೆ ಮೂರು ಬಾರಿ (TDS)', 'दिन में तीन बार (TDS)'],
  ['Four times a day (QID)', 'ದಿನಕ್ಕೆ ನಾಲ್ಕು ಬಾರಿ (QID)', 'दिन में चार बार (QID)'],
  ['At bedtime (HS)', 'ಮಲಗುವ ಮುನ್ನ (HS)', 'सोते समय (HS)'],
  ['Use exact times below', 'ಕೆಳಗಿನ ನಿಖರ ಸಮಯ ಬಳಸಿ', 'नीचे दिए सही समय इस्तेमाल करें'],
  ['Food', 'ಊಟ', 'भोजन'],
  ['Before food', 'ಊಟಕ್ಕೆ ಮೊದಲು', 'खाने से पहले'],
  ['After food', 'ಊಟದ ನಂತರ', 'खाने के बाद'],
  ['With food', 'ಊಟದ ಜೊತೆ', 'खाने के साथ'],
  ['Any time / not related to food', 'ಯಾವಾಗ ಬೇಕಾದರೂ / ಊಟಕ್ಕೆ ಸಂಬಂಧವಿಲ್ಲ', 'कभी भी / भोजन से संबंध नहीं'],
  ['Tablets per dose', 'ಒಂದು ಡೋಸ್‌ಗೆ ಮಾತ್ರೆಗಳು', 'प्रति खुराक गोलियाँ'],
  ['Tablets in hand now', 'ಈಗ ಕೈಯಲ್ಲಿರುವ ಮಾತ್ರೆಗಳು', 'अभी हाथ में गोलियाँ'],
  ['Tablets received', 'ಸಿಕ್ಕ ಮಾತ್ರೆಗಳು', 'मिली गोलियाँ'],
  ['Start date', 'ಪ್ರಾರಂಭ ದಿನಾಂಕ', 'शुरू की तारीख'],
  ['End date (optional)', 'ಕೊನೆಯ ದಿನಾಂಕ (ಐಚ್ಛಿಕ)', 'अंतिम तारीख (वैकल्पिक)'],
  ['Exact times (optional, 24-hour, comma separated)', 'ನಿಖರ ಸಮಯ (ಐಚ್ಛಿಕ, 24 ಗಂಟೆ, ಅಲ್ಪವಿರಾಮದಿಂದ)', 'सही समय (वैकल्पिक, 24 घंटे, कॉमा से अलग)'],
  ['Instructions for the patient (optional)', 'ರೋಗಿಗೆ ಸೂಚನೆಗಳು (ಐಚ್ಛಿಕ)', 'मरीज़ के लिए निर्देश (वैकल्पिक)'],
  ['Possible issues found. Please verify with the doctor/pharmacist before saving.', 'ಸಮಸ್ಯೆಗಳು ಕಂಡುಬಂದಿವೆ. ಉಳಿಸುವ ಮೊದಲು ವೈದ್ಯರು/ಔಷಧಿಕಾರರೊಂದಿಗೆ ಪರಿಶೀಲಿಸಿ.', 'संभावित समस्याएँ मिलीं। सेव करने से पहले डॉक्टर/फ़ार्मासिस्ट से पुष्टि करें।'],
  ['Go back and edit', 'ಹಿಂದೆ ಹೋಗಿ ತಿದ್ದಿ', 'वापस जाकर बदलें'],
  ['Prescription saved and schedule updated', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಉಳಿಸಲಾಗಿದೆ, ವೇಳಾಪಟ್ಟಿ ನವೀಕರಿಸಲಾಗಿದೆ', 'पर्चा सेव हुआ और समय-सारणी अपडेट हुई'],
  ['Prescription stopped', 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ', 'पर्चा बंद किया गया'],
  ['Prescribed by', 'ಸೂಚಿಸಿದವರು', 'लिखने वाले'],
  ['Prescriber', 'ಸೂಚಿಸಿದವರು', 'लिखने वाले'],
  ['Schedule', 'ವೇಳಾಪಟ್ಟಿ', 'समय-सारणी'],
  ['Stock', 'ದಾಸ್ತಾನು', 'स्टॉक'],
  ['Stop', 'ನಿಲ್ಲಿಸಿ', 'बंद करें'],
  ['Record refill', 'ರೀಫಿಲ್ ದಾಖಲಿಸಿ', 'रीफ़िल दर्ज करें'],
  ['Refill recorded', 'ರೀಫಿಲ್ ದಾಖಲಾಗಿದೆ', 'रीफ़िल दर्ज हुआ'],
  ['Source', 'ಮೂಲ', 'स्रोत'],
  ['PHC pharmacy', 'PHC ಔಷಧಾಲಯ', 'PHC फ़ार्मेसी'],
  ['Hospital', 'ಆಸ್ಪತ್ರೆ', 'अस्पताल'],
  ['Health camp', 'ಆರೋಗ್ಯ ಶಿಬಿರ', 'स्वास्थ्य शिविर'],
  ['Private', 'ಖಾಸಗಿ', 'निजी'],
  ['dosage missing', 'ಪ್ರಮಾಣ ಇಲ್ಲ', 'मात्रा नहीं'],
  ['missing', 'ಇಲ್ಲ', 'नहीं'],

  // ---- Reports ----
  ['Medication follow-up report', 'ಔಷಧ ಅನುಸರಣಾ ವರದಿ', 'दवा फ़ॉलो-अप रिपोर्ट'],
  ['A summary to review before the next consultation', 'ಮುಂದಿನ ಸಲಹೆಗೆ ಮೊದಲು ನೋಡಬೇಕಾದ ಸಾರಾಂಶ', 'अगली जाँच से पहले देखने के लिए सारांश'],
  ['Choose a patient to generate the report', 'ವರದಿ ತಯಾರಿಸಲು ರೋಗಿಯನ್ನು ಆರಿಸಿ', 'रिपोर्ट बनाने के लिए मरीज़ चुनें'],
  ['Print / save PDF', 'ಮುದ್ರಿಸಿ / PDF ಉಳಿಸಿ', 'प्रिंट / PDF सेव करें'],
  ['Download PDF / Print', 'PDF ಡೌನ್‌ಲೋಡ್ / ಮುದ್ರಣ', 'PDF डाउनलोड / प्रिंट'],
  ['Missed-dose history (latest)', 'ತಪ್ಪಿದ ಡೋಸ್ ಇತಿಹಾಸ (ಇತ್ತೀಚಿನ)', 'छूटी खुराक का इतिहास (हाल का)'],
  ['Missed doses (30 days)', 'ತಪ್ಪಿದ ಡೋಸ್ (30 ದಿನ)', 'छूटी खुराक (30 दिन)'],
  ['Refill gaps', 'ರೀಫಿಲ್ ಕೊರತೆ', 'रीफ़िल की कमी'],
  ['Daily adherence', 'ದಿನದ ಪಾಲನೆ', 'रोज़ का पालन'],
  ['Last 7 days', 'ಕಳೆದ 7 ದಿನ', 'पिछले 7 दिन'],
  ['Last 14 days', 'ಕಳೆದ 14 ದಿನ', 'पिछले 14 दिन'],
  ['Report period', 'ವರದಿ ಅವಧಿ', 'रिपोर्ट अवधि'],
  ['Preparing report…', 'ವರದಿ ತಯಾರಾಗುತ್ತಿದೆ…', 'रिपोर्ट तैयार हो रही है…'],
  ['No missed doses in this period. 👏', 'ಈ ಅವಧಿಯಲ್ಲಿ ಯಾವುದೇ ಡೋಸ್ ತಪ್ಪಿಲ್ಲ. 👏', 'इस अवधि में कोई खुराक नहीं छूटी। 👏'],
  ['No readings recorded in this period.', 'ಈ ಅವಧಿಯಲ್ಲಿ ಅಳತೆ ಇಲ್ಲ.', 'इस अवधि में कोई रीडिंग नहीं।'],
  ['⚠ Prescription warnings for the doctor', '⚠ ವೈದ್ಯರಿಗೆ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಎಚ್ಚರಿಕೆಗಳು', '⚠ डॉक्टर के लिए पर्चा चेतावनियाँ'],
  ['Doctor video calls', 'ವೈದ್ಯರ ವಿಡಿಯೋ ಕರೆಗಳು', 'डॉक्टर वीडियो कॉल'],
  ['Choose a patient', 'ರೋಗಿಯನ್ನು ಆರಿಸಿ', 'मरीज़ चुनें'],
  ['Choose a patient…', 'ರೋಗಿಯನ್ನು ಆರಿಸಿ…', 'मरीज़ चुनें…'],
  ['Choose patient', 'ರೋಗಿಯನ್ನು ಆರಿಸಿ', 'मरीज़ चुनें'],
  ['Choose…', 'ಆರಿಸಿ…', 'चुनें…'],

  // ---- Admin ----
  ['User management', 'ಬಳಕೆದಾರ ನಿರ್ವಹಣೆ', 'उपयोगकर्ता प्रबंधन'],
  ['Create doctors, ASHA workers, caregivers and admins. Deactivated users are logged out immediately.', 'ವೈದ್ಯರು, ಆಶಾ ಕಾರ್ಯಕರ್ತೆಯರು, ಆರೈಕೆದಾರರು ಮತ್ತು ನಿರ್ವಾಹಕರನ್ನು ರಚಿಸಿ. ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಿದವರು ತಕ್ಷಣ ಲಾಗ್ ಔಟ್ ಆಗುತ್ತಾರೆ.', 'डॉक्टर, आशा कार्यकर्ता, देखभालकर्ता और एडमिन बनाएँ। निष्क्रिय किए गए उपयोगकर्ता तुरंत लॉग आउट होते हैं।'],
  ['New user', 'ಹೊಸ ಬಳಕೆದಾರ', 'नया उपयोगकर्ता'],
  ['Create user', 'ಬಳಕೆದಾರರನ್ನು ರಚಿಸಿ', 'उपयोगकर्ता बनाएँ'],
  ['User created', 'ಬಳಕೆದಾರ ರಚಿಸಲಾಗಿದೆ', 'उपयोगकर्ता बनाया गया'],
  ['Role', 'ಪಾತ್ರ', 'भूमिका'],
  ['All roles', 'ಎಲ್ಲಾ ಪಾತ್ರಗಳು', 'सभी भूमिकाएँ'],
  ['Filter by role', 'ಪಾತ್ರದ ಪ್ರಕಾರ ಶೋಧಿಸಿ', 'भूमिका से छाँटें'],
  ['Temporary password', 'ತಾತ್ಕಾಲಿಕ ಪಾಸ್‌ವರ್ಡ್', 'अस्थायी पासवर्ड'],
  ['Audit log (latest)', 'ಲೆಕ್ಕಪರಿಶೋಧನಾ ದಾಖಲೆ (ಇತ್ತೀಚಿನ)', 'ऑडिट लॉग (हाल का)'],
  ['Audit logs', 'ಲೆಕ್ಕಪರಿಶೋಧನಾ ದಾಖಲೆಗಳು', 'ऑडिट लॉग'],
  ['Action', 'ಕ್ರಿಯೆ', 'कार्य'],
  ['Entity', 'ವಸ್ತು', 'इकाई'],
  ['User', 'ಬಳಕೆದಾರ', 'उपयोगकर्ता'],
  ['Time', 'ಸಮಯ', 'समय'],
  ['Relation to patient (e.g. Son)', 'ರೋಗಿಯೊಂದಿಗೆ ಸಂಬಂಧ (ಉದಾ. ಮಗ)', 'मरीज़ से रिश्ता (जैसे बेटा)'],
  ['Language', 'ಭಾಷೆ', 'भाषा'],

  // ---- Teleconsult / reminders / pharmacy / scan / vitals ----
  ['Confirm call', 'ಕರೆ ಖಚಿತಪಡಿಸಿ', 'कॉल पक्की करें'],
  ['Decline', 'ನಿರಾಕರಿಸಿ', 'मना करें'],
  ['Mark call done', 'ಕರೆ ಮುಗಿದಿದೆ', 'कॉल पूरी हुई'],
  ['Call time', 'ಕರೆಯ ಸಮಯ', 'कॉल का समय'],
  ['Cancel request', 'ವಿನಂತಿ ರದ್ದುಮಾಡಿ', 'अनुरोध रद्द करें'],
  ['Send request', 'ವಿನಂತಿ ಕಳುಹಿಸಿ', 'अनुरोध भेजें'],
  ['Request sent to the doctor', 'ವೈದ್ಯರಿಗೆ ವಿನಂತಿ ಕಳುಹಿಸಲಾಗಿದೆ', 'डॉक्टर को अनुरोध भेजा गया'],
  ['Request cancelled', 'ವಿನಂತಿ ರದ್ದಾಗಿದೆ', 'अनुरोध रद्द हुआ'],
  ['No consultations yet', 'ಇನ್ನೂ ಯಾವುದೇ ಸಲಹೆ ಇಲ್ಲ', 'अभी कोई परामर्श नहीं'],
  ['Why do you need the doctor?', 'ವೈದ್ಯರು ಏಕೆ ಬೇಕು?', 'डॉक्टर की ज़रूरत क्यों है?'],
  ['Preferred time (optional)', 'ಇಷ್ಟದ ಸಮಯ (ಐಚ್ಛಿಕ)', 'पसंदीदा समय (वैकल्पिक)'],
  ['Note for the patient / ASHA after the call (optional)', 'ಕರೆಯ ನಂತರ ರೋಗಿ / ಆಶಾಗೆ ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)', 'कॉल के बाद मरीज़ / आशा के लिए नोट (वैकल्पिक)'],
  ['Requests & booked calls', 'ವಿನಂತಿಗಳು ಮತ್ತು ನಿಗದಿತ ಕರೆಗಳು', 'अनुरोध और तय कॉल'],
  ['My requests', 'ನನ್ನ ವಿನಂತಿಗಳು', 'मेरे अनुरोध'],
  ['Waiting for doctor', 'ವೈದ್ಯರಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ', 'डॉक्टर का इंतज़ार'],
  ['Call booked', 'ಕರೆ ನಿಗದಿಯಾಗಿದೆ', 'कॉल तय'],
  ['Done', 'ಮುಗಿದಿದೆ', 'पूरा'],
  ['Cancelled', 'ರದ್ದಾಗಿದೆ', 'रद्द'],
  ['Patient', 'ರೋಗಿ', 'मरीज़'],
  ['Reminder language', 'ನೆನಪಿನ ಭಾಷೆ', 'रिमाइंडर भाषा'],
  ['Save languages', 'ಭಾಷೆಗಳನ್ನು ಉಳಿಸಿ', 'भाषाएँ सेव करें'],
  ['Reminder languages saved', 'ನೆನಪಿನ ಭಾಷೆಗಳು ಉಳಿಸಲಾಗಿದೆ', 'रिमाइंडर भाषाएँ सेव हुईं'],
  ['Save time', 'ಸಮಯ ಉಳಿಸಿ', 'समय सेव करें'],
  ['Reminder time saved. Everyone has been informed.', 'ನೆನಪಿನ ಸಮಯ ಉಳಿಸಲಾಗಿದೆ. ಎಲ್ಲರಿಗೂ ತಿಳಿಸಲಾಗಿದೆ.', 'रिमाइंडर समय सेव हुआ। सबको बता दिया गया।'],
  ['You can move the time. The number of doses stays as the doctor prescribed.', 'ನೀವು ಸಮಯ ಬದಲಿಸಬಹುದು. ಡೋಸ್‌ಗಳ ಸಂಖ್ಯೆ ವೈದ್ಯರು ಸೂಚಿಸಿದಂತೆಯೇ ಇರುತ್ತದೆ.', 'आप समय बदल सकते हैं। खुराकों की संख्या डॉक्टर के अनुसार ही रहेगी।'],
  ['Rings at', 'ರಿಂಗ್ ಆಗುವ ಸಮಯ', 'बजने का समय'],
  ['Record voice message', 'ಧ್ವನಿ ಸಂದೇಶ ದಾಖಲಿಸಿ', 'आवाज़ संदेश रिकॉर्ड करें'],
  ['Record again', 'ಮತ್ತೆ ದಾಖಲಿಸಿ', 'फिर से रिकॉर्ड करें'],
  ['Voice reminder saved. It will play at medicine time.', 'ಧ್ವನಿ ನೆನಪು ಉಳಿಸಲಾಗಿದೆ. ಔಷಧಿ ಸಮಯದಲ್ಲಿ ಕೇಳಿಸುತ್ತದೆ.', 'आवाज़ रिमाइंडर सेव हुआ। दवा के समय बजेगा।'],
  ['No active medicines', 'ಸಕ್ರಿಯ ಔಷಧಿಗಳಿಲ್ಲ', 'कोई चालू दवा नहीं'],
  ['Voice check for this browser', 'ಈ ಬ್ರೌಸರ್‌ನ ಧ್ವನಿ ಪರಿಶೀಲನೆ', 'इस ब्राउज़र की आवाज़ जाँच'],
  ['Order:', 'ಕ್ರಮ:', 'क्रम:'],
  ['Hear sample', 'ಮಾದರಿ ಕೇಳಿ', 'नमूना सुनें'],
  ['Use my location', 'ನನ್ನ ಸ್ಥಳ ಬಳಸಿ', 'मेरी जगह इस्तेमाल करें'],
  ['Show', 'ತೋರಿಸಿ', 'दिखाएँ'],
  ['Jan Aushadhi only', 'ಜನ ಔಷಧಿ ಮಾತ್ರ', 'केवल जन औषधि'],
  ['Government (free)', 'ಸರ್ಕಾರಿ (ಉಚಿತ)', 'सरकारी (मुफ़्त)'],
  ['Private shops', 'ಖಾಸಗಿ ಅಂಗಡಿಗಳು', 'निजी दुकानें'],
  ['Savings for patient', 'ರೋಗಿಯ ಉಳಿತಾಯ', 'मरीज़ की बचत'],
  ['Search real Kendras on Google Maps', 'ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್‌ನಲ್ಲಿ ನಿಜವಾದ ಕೇಂದ್ರಗಳನ್ನು ಹುಡುಕಿ', 'गूगल मैप्स पर असली केंद्र खोजें'],
  ['Jan Aushadhi (generic, low price)', 'ಜನ ಔಷಧಿ (ಜೆನೆರಿಕ್, ಕಡಿಮೆ ಬೆಲೆ)', 'जन औषधि (जेनेरिक, कम दाम)'],
  ['Government – free medicines', 'ಸರ್ಕಾರಿ – ಉಚಿತ ಔಷಧಿ', 'सरकारी – मुफ़्त दवाएँ'],
  ['Private medical shop', 'ಖಾಸಗಿ ಔಷಧಿ ಅಂಗಡಿ', 'निजी दवा दुकान'],
  ['Directions', 'ದಾರಿ', 'रास्ता'],
  ['Generic price list (per 10 tablets)', 'ಜೆನೆರಿಕ್ ಬೆಲೆ ಪಟ್ಟಿ (10 ಮಾತ್ರೆಗಳಿಗೆ)', 'जेनेरिक दाम सूची (10 गोलियों के)'],
  ['No pharmacies found', 'ಯಾವುದೇ ಔಷಧಾಲಯ ಸಿಗಲಿಲ್ಲ', 'कोई फ़ार्मेसी नहीं मिली'],
  ['Brand / 10', 'ಬ್ರ್ಯಾಂಡ್ / 10', 'ब्रांड / 10'],
  ['Generic / 10', 'ಜೆನೆರಿಕ್ / 10', 'जेनेरिक / 10'],
  ['Save / month', 'ಉಳಿತಾಯ / ತಿಂಗಳು', 'बचत / महीना'],
  ['Take / choose photo', 'ಫೋಟೋ ತೆಗೆಯಿರಿ / ಆರಿಸಿ', 'फ़ोटो लें / चुनें'],
  ['Check typed name', 'ಬರೆದ ಹೆಸರು ಪರಿಶೀಲಿಸಿ', 'लिखा नाम जाँचें'],
  ["Check against this patient's prescriptions (optional)", 'ಈ ರೋಗಿಯ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ಗಳೊಂದಿಗೆ ಹೋಲಿಸಿ (ಐಚ್ಛಿಕ)', 'इस मरीज़ के पर्चों से मिलाएँ (वैकल्पिक)'],
  ['Text read from the strip (you can correct it or type the name)', 'ಪಟ್ಟಿಯಿಂದ ಓದಿದ ಪಠ್ಯ (ತಿದ್ದಬಹುದು ಅಥವಾ ಹೆಸರು ಬರೆಯಬಹುದು)', 'पट्टी से पढ़ा गया लेख (सुधार सकते हैं या नाम लिखें)'],
  ['Demo samples:', 'ಡೆಮೊ ಮಾದರಿಗಳು:', 'डेमो नमूने:'],
  ['Result', 'ಫಲಿತಾಂಶ', 'परिणाम'],
  ['Medicine not recognised', 'ಔಷಧಿ ಗುರುತಿಸಲಾಗಲಿಲ್ಲ', 'दवा पहचानी नहीं गई'],
  ['Medicine found', 'ಔಷಧಿ ಸಿಕ್ಕಿತು', 'दवा मिली'],
  ['Contains:', 'ಒಳಗೊಂಡಿದೆ:', 'इसमें है:'],
  ['Add at least 2 readings to see a trend', 'ಪ್ರವೃತ್ತಿ ನೋಡಲು ಕನಿಷ್ಠ 2 ಅಳತೆ ಸೇರಿಸಿ', 'रुझान देखने के लिए कम से कम 2 रीडिंग जोड़ें'],
  ['All readings (last 60 days)', 'ಎಲ್ಲಾ ಅಳತೆಗಳು (ಕಳೆದ 60 ದಿನ)', 'सभी रीडिंग (पिछले 60 दिन)'],
  ['No readings yet', 'ಇನ್ನೂ ಅಳತೆ ಇಲ್ಲ', 'अभी कोई रीडिंग नहीं'],
  ['Lower (diastolic)', 'ಕೆಳಗಿನ (ಡಯಾಸ್ಟೊಲಿಕ್)', 'नीचे वाला (डायस्टोलिक)'],
  ['Upper (systolic)', 'ಮೇಲಿನ (ಸಿಸ್ಟೊಲಿಕ್)', 'ऊपर वाला (सिस्टोलिक)'],
  ['Note (optional)', 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)', 'नोट (वैकल्पिक)'],
  ['Blood pressure', 'ರಕ್ತದೊತ್ತಡ', 'रक्तचाप'],
  ['Sugar (fasting)', 'ಸಕ್ಕರೆ (ಖಾಲಿ ಹೊಟ್ಟೆ)', 'शुगर (खाली पेट)'],
  ['Sugar (after food / random)', 'ಸಕ್ಕರೆ (ಊಟದ ನಂತರ)', 'शुगर (खाने के बाद)'],
  ['Pulse', 'ನಾಡಿ', 'नाड़ी'],
  ['Temperature', 'ಜ್ವರ / ತಾಪಮಾನ', 'तापमान'],
  ['Weight', 'ತೂಕ', 'वज़न'],

  // ---- Common ----
  ['Loading…', 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…', 'लोड हो रहा है…'],
  ['Try again', 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', 'फिर से कोशिश करें'],
  ['Reload', 'ಮರುಲೋಡ್', 'रीलोड'],
  ['Something went wrong. Your data is safe.', 'ಏನೋ ತಪ್ಪಾಗಿದೆ. ನಿಮ್ಮ ಡೇಟಾ ಸುರಕ್ಷಿತವಾಗಿದೆ.', 'कुछ गलत हो गया। आपका डेटा सुरक्षित है।'],
  ['Close', 'ಮುಚ್ಚಿ', 'बंद करें'],
  ['Dismiss', 'ಮುಚ್ಚಿ', 'हटाएँ'],
  ['Send', 'ಕಳುಹಿಸಿ', 'भेजें'],
  ['Open', 'ತೆರೆ', 'खोलें'],
  ['Hide', 'ಮರೆಮಾಡಿ', 'छिपाएँ'],
  ['Deleted', 'ಅಳಿಸಲಾಗಿದೆ', 'हटाया गया'],
  ['Suggested questions', 'ಸೂಚಿಸಿದ ಪ್ರಶ್ನೆಗಳು', 'सुझाए गए सवाल'],
  ['English', 'English', 'English'],
  ['Kannada', 'ಕನ್ನಡ', 'कन्नड़'],
  ['Hindi', 'ಹಿಂದಿ', 'हिंदी'],
  ['Today:', 'ಇಂದು:', 'आज:'],
  ['Adherence (7 days):', 'ಪಾಲನೆ (7 ದಿನ):', 'पालन (7 दिन):'],
  ['Caregiver:', 'ಆರೈಕೆದಾರ:', 'देखभालकर्ता:'],
  ['Doctor:', 'ವೈದ್ಯರು:', 'डॉक्टर:'],
  ['ASHA:', 'ಆಶಾ:', 'आशा:'],
  ['taken', 'ತೆಗೆದುಕೊಂಡಿದೆ', 'ली गई'],
  ['missed', 'ತಪ್ಪಿದೆ', 'छूटी'],
  ['pending', 'ಬಾಕಿ', 'बाकी'],
  ['Smart · Accessible · Patient-centric', 'ಸ್ಮಾರ್ಟ್ · ಸುಲಭ · ರೋಗಿ-ಕೇಂದ್ರಿತ', 'स्मार्ट · सुलभ · मरीज़-केंद्रित'],
];

// Patterns with numbers: "5 days", "1 days", "12 left" …
const PATTERNS: [RegExp, Record<L, (m: RegExpMatchArray) => string>][] = [
  [/^(\d+) days?$/, { kn: (m) => `${m[1]} ದಿನ`, hi: (m) => `${m[1]} दिन` }],
  [/^(\d+) days? left$/, { kn: (m) => `${m[1]} ದಿನ ಉಳಿದಿದೆ`, hi: (m) => `${m[1]} दिन बचे` }],
  [/^(\d+) left$/, { kn: (m) => `${m[1]} ಉಳಿದಿದೆ`, hi: (m) => `${m[1]} बचे` }],
  [/^(\d+) missed today$/, { kn: (m) => `ಇಂದು ${m[1]} ತಪ್ಪಿದೆ`, hi: (m) => `आज ${m[1]} छूटी` }],
  [/^(\d+) y$/, { kn: (m) => `${m[1]} ವ`, hi: (m) => `${m[1]} वर्ष` }],
];

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const MAP: Record<L, Map<string, string>> = { kn: new Map(), hi: new Map() };
for (const [en, kn, hi] of PHRASES) {
  MAP.kn.set(norm(en), kn);
  MAP.hi.set(norm(en), hi);
}

function translate(text: string, lang: L): string | null {
  const core = norm(text);
  if (!core || !/[A-Za-z]/.test(core)) return null;
  let out = MAP[lang].get(core);
  if (!out)
    for (const [re, f] of PATTERNS) {
      const m = core.match(re);
      if (m) {
        out = f[lang](m);
        break;
      }
    }
  if (!out) return null;
  // Keep the original leading / trailing spaces so inline text still flows.
  const lead = text.match(/^\s*/)![0];
  const trail = text.match(/\s*$/)![0];
  return lead + out + trail;
}

const ORIGINAL = new WeakMap<Node, string>(); // text node → English source
const WRITTEN = new WeakMap<Node, string>(); // text node → what we last wrote
const ATTRS = ['placeholder', 'aria-label', 'title'] as const;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'svg']);

let lang: 'en' | L = 'en';

function skipped(el: Element | null) {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP.has(e.tagName) || e.hasAttribute('data-no-translate') || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function doText(node: Text) {
  const current = node.nodeValue ?? '';
  // React changed the text since we last wrote it → that is the new English source.
  if (WRITTEN.get(node) !== current) ORIGINAL.set(node, current);
  const src = ORIGINAL.get(node) ?? current;
  const next = lang === 'en' ? src : (translate(src, lang) ?? src);
  if (next !== current) node.nodeValue = next;
  WRITTEN.set(node, next);
}

function doAttrs(el: Element) {
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const key = `data-i18n-src-${a}`;
    const current = el.getAttribute(a) ?? '';
    const written = el.getAttribute(`data-i18n-out-${a}`);
    if (written !== current) el.setAttribute(key, current);
    const src = el.getAttribute(key) ?? current;
    const next = lang === 'en' ? src : (translate(src, lang) ?? src);
    if (next !== current) el.setAttribute(a, next);
    el.setAttribute(`data-i18n-out-${a}`, next);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skipped(root.parentElement)) doText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skipped(el)) return;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (!skipped(n.parentElement)) doText(n as Text);
    } else if (!skipped(n as Element)) doAttrs(n as Element);
    n = tw.nextNode();
  }
}

let observer: MutationObserver | null = null;

/** Start translating the whole page; follows the app's language setting automatically. */
export function startAutoTranslate() {
  const apply = (l: string) => {
    lang = l === 'kn' || l === 'hi' ? l : 'en';
    document.documentElement.lang = lang;
    walk(document.body);
  };
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') {
        if (WRITTEN.get(m.target) !== m.target.nodeValue && !skipped(m.target.parentElement)) doText(m.target as Text);
      } else if (m.type === 'attributes') {
        const el = m.target as Element;
        const a = m.attributeName as (typeof ATTRS)[number];
        if (el.getAttribute(`data-i18n-out-${a}`) !== el.getAttribute(a)) doAttrs(el);
      } else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  apply(useAuth.getState().lang);
  useAuth.subscribe((s, prev) => {
    if (s.lang !== prev.lang) apply(s.lang);
  });
}
