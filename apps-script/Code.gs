
const SHEET_ID = "1KKFGtWQBedwGpFQHu9hctkoTrKmq9DrHWQMAB6uU6eE";

function doGet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sched = ss.getSheetByName("Schedule") || ss.insertSheet("Schedule");
  var dump = ss.getSheetByName("MentalDump") || ss.insertSheet("MentalDump");
  var grocSheet = ss.getSheetByName("Groceries") || ss.insertSheet("Groceries");
  var catSheet = ss.getSheetByName("Categories") || ss.insertSheet("Categories");
  var storeSheet = ss.getSheetByName("Stores") || ss.insertSheet("Stores");
  var weekData = null;
  var captures = [];
  var groceries = [];
  var categories = [];
  var stores = [];
  var meta = {};
  try { weekData = JSON.parse(sched.getRange("A1").getValue()); } catch(e) {}
  try { captures = JSON.parse(dump.getRange("A1").getValue()); } catch(e) {}
  try { groceries = JSON.parse(grocSheet.getRange("A1").getValue()); } catch(e) {}
  try { categories = JSON.parse(catSheet.getRange("A1").getValue()); } catch(e) {}
  try { stores = JSON.parse(storeSheet.getRange("A1").getValue()); } catch(e) {}
  try { meta = JSON.parse(sched.getRange("B1").getValue()); } catch(e) {}
  var result = {
    weekData: weekData,
    captures: captures,
    groceries: groceries,
    categories: categories.length ? categories : null,
    stores: stores.length ? stores : null,
    parent1Name: meta.parent1Name || "Fernando",
    parent2Name: meta.parent2Name || "Yenny",
    currentWeek: meta.currentWeek || ""
  };
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var body = JSON.parse(e.postData.contents);
  if (body.action === "anthropic") {
    var options = {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      payload: JSON.stringify(body.payload),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", options);
    return ContentService.createTextOutput(response.getContentText()).setMimeType(ContentService.MimeType.JSON);
  }
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
  return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
}