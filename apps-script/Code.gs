// Family Coordinator v20 — Apps Script
// Sheet ID: 1KKFGtWQBedwGpFQHu9hctkoTrKmq9DrHWQMAB6uU6eE
// Storage: v8.4 sheets = JSON blobs in A1. v20 sheets = row-per-record with header row.

var SHEET_ID = "1KKFGtWQBedwGpFQHu9hctkoTrKmq9DrHWQMAB6uU6eE";

// v20 sheet schemas — order matters (header row)
var V20_SCHEMAS = {
  Recipes: ["recipeId","name","sourceUrl","sourceImage","baseServings","methodSteps",
            "totalTimeMin","dietaryTags","cuisine","createdBy","createdAt","timesCooked",
            "lastCookedAt","notes","parseStatus","rawSource"],
  Ingredients: ["ingredientId","canonicalName","usdaFdcId","openFoodFactsBarcode",
                "density_g_per_ml","nutritionPer100g","preferredStore","needsReview","lastUpdated"],
  RecipeIngredients: ["recipeIngredientId","recipeId","ingredientId","quantity","unit",
                      "preparation","isOptional"],
  MealPlanSlots: ["slotId","weekOf","dayOfWeek","slot","recipeId","servingsPlanned",
                  "noteFreeText","cookBy","cookedStatus"],
  Pantry: ["pantryId","ingredientId","quantity","unit","addedAt","addedVia","expiryDate"],
  ReceiptImports: ["receiptId","source","rawContent","parsedJSON","lineItemCount",
                   "matchedCount","matchStatus","importedAt","importedBy"],
  Family: ["personId","name","role","birthDate","dietaryRestrictions","nutritionTargetId","createdAt"],
  Tasks: ["taskId","title","ownerId","dueDate","status","createdAt","completedAt"],
  Digests: ["digestId","weekOf","generatedAt","summary"],
  Documents: ["documentId","name","category","driveFileId","uploadedBy","uploadedAt"],
  Maintenance: ["maintenanceId","item","cadenceDays","lastDoneAt","nextDueAt","notes"],
  MealLog: ["logId","date","slot","recipeId","ingredientId","servingsConsumed","personId","loggedAt"],
  PersonNutritionTarget: ["targetId","personId","startDate","dailyKcalTarget",
                          "macroSplitJSON","micronutrientTargetsJSON","notes"]
};

var V8_SHEETS = ["Schedule","MentalDump","Groceries","Categories","Stores"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isV20Sheet(name) {
  return !!V20_SCHEMAS[name];
}

function getOrCreate(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readV20Sheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i] === "" ? null : row[i]; });
    return obj;
  });
}

function appendV20Row(ss, name, rowObj) {
  var sheet = getOrCreate(ss, name);
  var headers = V20_SCHEMAS[name];
  var row = headers.map(function(h) { return rowObj[h] !== undefined ? rowObj[h] : ""; });
  sheet.appendRow(row);
}

function updateV20Row(ss, name, idField, idValue, rowObj) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  var headers = data[0];
  var idCol = headers.indexOf(idField);
  if (idCol < 0) return false;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] == idValue) {
      var updated = headers.map(function(h, j) {
        return rowObj[h] !== undefined ? rowObj[h] : data[i][j];
      });
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
      return true;
    }
  }
  return false;
}

function deleteV20Row(ss, name, idField, idValue) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf(idField);
  if (idCol < 0) return false;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] == idValue) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function getIdField(name) {
  var schema = V20_SCHEMAS[name];
  return schema ? schema[0] : "id";
}

// ── doGet ────────────────────────────────────────────────────────────────────

function doGet(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var params = (e && e.parameter) ? e.parameter : {};

  // v20: ?sheet=Recipes returns row-per-record JSON
  if (params.sheet && isV20Sheet(params.sheet)) {
    var rows = readV20Sheet(ss, params.sheet);
    return ContentService.createTextOutput(JSON.stringify(rows))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // v8.4 legacy: return all blob data
  var sched = ss.getSheetByName("Schedule") || ss.insertSheet("Schedule");
  var dump = ss.getSheetByName("MentalDump") || ss.insertSheet("MentalDump");
  var grocSheet = ss.getSheetByName("Groceries") || ss.insertSheet("Groceries");
  var catSheet = ss.getSheetByName("Categories") || ss.insertSheet("Categories");
  var storeSheet = ss.getSheetByName("Stores") || ss.insertSheet("Stores");

  var weekData = null, captures = [], groceries = [], categories = [], stores = [], meta = {};
  try { weekData = JSON.parse(sched.getRange("A1").getValue()); } catch(e) {}
  try { captures = JSON.parse(dump.getRange("A1").getValue()); } catch(e) {}
  try { groceries = JSON.parse(grocSheet.getRange("A1").getValue()); } catch(e) {}
  try { categories = JSON.parse(catSheet.getRange("A1").getValue()); } catch(e) {}
  try { stores = JSON.parse(storeSheet.getRange("A1").getValue()); } catch(e) {}
  try { meta = JSON.parse(sched.getRange("B1").getValue()); } catch(e) {}

  var result = {
    weekData: weekData, captures: captures, groceries: groceries,
    categories: categories.length ? categories : null,
    stores: stores.length ? stores : null,
    parent1Name: meta.parent1Name || "Fernando",
    parent2Name: meta.parent2Name || "Yenny",
    currentWeek: meta.currentWeek || ""
  };
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doPost ───────────────────────────────────────────────────────────────────

function doPost(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var body = JSON.parse(e.postData.contents);

  // v20: structured action/sheet/row API
  if (body.action && body.sheet && isV20Sheet(body.sheet)) {
    var idField = getIdField(body.sheet);
    if (body.action === "append") {
      appendV20Row(ss, body.sheet, body.row);
      return ContentService.createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (body.action === "update") {
      var updated = updateV20Row(ss, body.sheet, idField, body.rowId, body.row);
      return ContentService.createTextOutput(JSON.stringify({ok: updated}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (body.action === "delete") {
      var deleted = deleteV20Row(ss, body.sheet, idField, body.rowId);
      return ContentService.createTextOutput(JSON.stringify({ok: deleted}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // v8.4 legacy blob writes
  if (body.weekData !== undefined) {
    var sched = ss.getSheetByName("Schedule") || ss.insertSheet("Schedule");
    sched.getRange("A1").setValue(JSON.stringify(body.weekData));
    sched.getRange("B1").setValue(JSON.stringify({
      parent1Name: body.parent1Name,
      parent2Name: body.parent2Name,
      currentWeek: body.currentWeek
    }));
  }
  if (body.captures !== undefined) {
    var dump = ss.getSheetByName("MentalDump") || ss.insertSheet("MentalDump");
    dump.getRange("A1").setValue(JSON.stringify(body.captures));
  }
  if (body.groceries !== undefined) {
    var grocSheet = ss.getSheetByName("Groceries") || ss.insertSheet("Groceries");
    grocSheet.getRange("A1").setValue(JSON.stringify(body.groceries));
  }
  if (body.categories !== undefined) {
    var catSheet = ss.getSheetByName("Categories") || ss.insertSheet("Categories");
    catSheet.getRange("A1").setValue(JSON.stringify(body.categories));
  }
  if (body.stores !== undefined) {
    var storeSheet = ss.getSheetByName("Stores") || ss.insertSheet("Stores");
    storeSheet.getRange("A1").setValue(JSON.stringify(body.stores));
  }

  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── initV20Sheets — idempotent ────────────────────────────────────────────────

function initV20Sheets() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // Create all v20 sheets with headers (skip if already exists with headers)
  Object.keys(V20_SCHEMAS).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, V20_SCHEMAS[name].length).setValues([V20_SCHEMAS[name]]);
      // Bold the header row
      sheet.getRange(1, 1, 1, V20_SCHEMAS[name].length).setFontWeight("bold");
    } else {
      // Check if header already written
      var existing = sheet.getRange(1, 1).getValue();
      if (!existing) {
        sheet.getRange(1, 1, 1, V20_SCHEMAS[name].length).setValues([V20_SCHEMAS[name]]);
        sheet.getRange(1, 1, 1, V20_SCHEMAS[name].length).setFontWeight("bold");
      }
    }
  });

  // Extend Groceries sheet with v20 columns if not present
  var grocSheet = ss.getSheetByName("Groceries");
  if (grocSheet) {
    var lastCol = grocSheet.getLastColumn();
    if (lastCol > 0) {
      var headers = grocSheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var v20GroceryCols = ["quantity","unit","pantryBacked","ingredientId"];
      v20GroceryCols.forEach(function(col) {
        if (headers.indexOf(col) < 0) {
          var newCol = lastCol + 1;
          grocSheet.getRange(1, newCol).setValue(col);
          lastCol++;
        }
      });
    }
  }

  // Seed Family sheet with Fernando, Yenny, Leo (idempotent — check by name)
  var familyRows = readV20Sheet(ss, "Family");
  var existingNames = familyRows.map(function(r) { return r.name; });
  var now = new Date().toISOString();

  [
    { name: "Fernando", role: "parent" },
    { name: "Yenny",    role: "parent" },
    { name: "Leo",      role: "child"  },
  ].forEach(function(person) {
    if (existingNames.indexOf(person.name) < 0) {
      appendV20Row(ss, "Family", {
        personId: Utilities.getUuid(),
        name: person.name,
        role: person.role,
        createdAt: now
      });
    }
  });

  Logger.log("initV20Sheets complete — " + Object.keys(V20_SCHEMAS).length + " sheets initialized, Family seeded.");
}

// ── ensureDragnetFolder — idempotent ──────────────────────────────────────────

function ensureDragnetFolder() {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty("DRAGNET_ROOT_ID");
  var root;

  if (rootId) {
    try { root = DriveApp.getFolderById(rootId); }
    catch(e) { rootId = null; }
  }

  if (!rootId) {
    var existing = DriveApp.getFoldersByName("Family-Coordinator-Dragnet");
    root = existing.hasNext() ? existing.next() : DriveApp.createFolder("Family-Coordinator-Dragnet");
    props.setProperty("DRAGNET_ROOT_ID", root.getId());
  }

  ["recipes","receipts","backups"].forEach(function(sub) {
    var propKey = "DRAGNET_" + sub.toUpperCase() + "_ID";
    var subId = props.getProperty(propKey);
    if (!subId) {
      var subs = root.getFoldersByName(sub);
      var folder = subs.hasNext() ? subs.next() : root.createFolder(sub);
      props.setProperty(propKey, folder.getId());
    }
  });

  Logger.log("ensureDragnetFolder complete.");
  return root.getId();
}

// ── weeklyBackup ──────────────────────────────────────────────────────────────

function weeklyBackup() {
  ensureDragnetFolder();
  var props = PropertiesService.getScriptProperties();
  var backupFolderId = props.getProperty("DRAGNET_BACKUPS_ID");
  var backupRoot = DriveApp.getFolderById(backupFolderId);

  var dateStr = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd");
  var dayFolder;
  var existing = backupRoot.getFoldersByName(dateStr);
  dayFolder = existing.hasNext() ? existing.next() : backupRoot.createFolder(dateStr);

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var allSheets = {};

  // Backup all sheets
  ss.getSheets().forEach(function(sheet) {
    var name = sheet.getName();
    var data = sheet.getDataRange().getValues();
    allSheets[name] = data;

    // Write CSV
    var csv = data.map(function(row) {
      return row.map(function(cell) {
        var s = String(cell).replace(/"/g, '""');
        return s.indexOf(",") >= 0 || s.indexOf("\n") >= 0 ? '"' + s + '"' : s;
      }).join(",");
    }).join("\n");

    var existing = dayFolder.getFilesByName(name + ".csv");
    if (existing.hasNext()) existing.next().setTrashed(true);
    dayFolder.createFile(name + ".csv", csv, MimeType.CSV);
  });

  // Write combined JSON
  var json = JSON.stringify(allSheets, null, 2);
  var existingJson = dayFolder.getFilesByName("all-sheets.json");
  if (existingJson.hasNext()) existingJson.next().setTrashed(true);
  dayFolder.createFile("all-sheets.json", json, MimeType.PLAIN_TEXT);

  Logger.log("weeklyBackup complete: " + dateStr);
}

// ── uploadBinary ──────────────────────────────────────────────────────────────

function uploadBinary(params) {
  // params: {name, mimeType, base64, folder} where folder = "recipes"|"receipts"
  ensureDragnetFolder();
  var props = PropertiesService.getScriptProperties();
  var folderKey = "DRAGNET_" + (params.folder || "recipes").toUpperCase() + "_ID";
  var folderId = props.getProperty(folderKey);
  var folder = DriveApp.getFolderById(folderId);

  var bytes = Utilities.base64Decode(params.base64);
  var blob = Utilities.newBlob(bytes, params.mimeType, params.name);
  var file = folder.createFile(blob);
  return file.getId();
}

// ── installWeeklyBackupTrigger — idempotent ───────────────────────────────────

function installWeeklyBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "weeklyBackup") {
      Logger.log("weeklyBackup trigger already installed.");
      return;
    }
  }
  ScriptApp.newTrigger("weeklyBackup")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(23)
    .inTimezone("America/New_York")
    .create();
  Logger.log("weeklyBackup trigger installed: Sunday 11pm ET.");
}
