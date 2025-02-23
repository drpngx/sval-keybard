////////////////////////////////////
//
//  Vial QMK Settings: Fetching, Parsing, Pushing.
//
//  QMK Settings are weird. This is how I understand it:
//
//    - We get a JSON file, here as QMK_SETTINGS.
//    - The JSON file defines which QSIDs (QMK Setting IDs) it supports.
//        * (QSID starts with 1)
//    - The JSON file lists all, regardless of whether or not the KB supports
//      it.
//    - Each QSID has a width: 1 (byte), 2 (uint16) or 4 (uint32)
//    - We fetch each QS, by its QSID, individually.
//        * It first returns a byte we ignore, presumably the QSID back.
//
////////////////////////////////////

Vial.qmk = (function() {
  return {
    async get(kbinfo) {
      // Vial is weird about this. It wants to give us an array of QSIDs (QMK Setting IDs) that it supports.
      // So what we get first is basically ...
      // [1, 2, 3, 4, 5, 6, 7, ... 20, 21, 0xFFFF, 0xFFFF]
      const supported = {};

      let offset = 0;
      let query = true
      while (query) {
        data = await Vial.USB.sendVial(Vial.USB.CMD_VIAL_QMK_SETTINGS_QUERY, [offset], {uint16: true});
        for (const val of data) {
          if (val === 0xFFFF) {
            query = false;
            break;
          }
          supported[val] = true;
        }
        offset += 16
      }

      // Parse out the widths for each QSID value.
      // No width = B (byte). Width 2 = H (short). Width 4 = I (int).
      const qsid_unpacks = {};
      for (const tab of QMK_SETTINGS.tabs) {
        for (const field of tab.fields) {
          if (field.width === 2) {
            qsid_unpacks[field.qsid] = 'H';
          } else if (field.width === 4) {
            qsid_unpacks[field.qsid] = 'I';
          } else {
            qsid_unpacks[field.qsid] = 'B';
          }
        }
      }

      // We now have our supported QSIDs. 1...21, for my sval. Fetch them.
      const settings = {};
        for (const qsid of Object.keys(qsid_unpacks)) {
            // In Vial, the entries are hidden from the UI if they are not supported.
            // The whole tab is hidden if none of its entries are supported.
            // That means hiding in kbui/qmk.js:renderAllTabs.
            if (qsid in supported) {
                // Don't forget the ignored byte.
                const unpack = 'B' + qsid_unpacks[qsid];
                // qsid is a uint16. USB.send will ultimately use UIntArray8, so we encode the
                // two-bytes value here.
                let q0 = qsid & 0xFF;
                let q1 = (qsid >> 8) & 0xFFF;
                val = await Vial.USB.sendVial(Vial.USB.CMD_VIAL_QMK_SETTINGS_GET, [q0, q1], {unpack: unpack});
                console.log('Read qsid', qsid, 'val', val)
                settings[qsid] = val[1];
            }
      }
      kbinfo.settings = settings;
    },
    async push(kbinfo, qsid) {
      const val = kbinfo.settings[qsid];
      vals = LE32(val);
      console.log('pushing via qmk set:', qsid, vals);
      await Vial.USB.sendVial(Vial.USB.CMD_VIAL_QMK_SETTINGS_SET, [...LE16(qsid), ...vals]);
    },
  };
})();
