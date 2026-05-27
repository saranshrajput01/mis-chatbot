const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = "1ZJVFQ5zETwqoiZ5isqRxcKzLzLRwrLiFjqLwEqATBw4";
const ACCESS_CONTROL_GID = "91964318";

// Initialize Google Sheets API
function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '..', 'logical-craft-438704-n8-d0d8ae886a53.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Add permission columns to ACCESS_CONTROL sheet
async function setupAccessControlColumns() {
  try {
    const sheets = await getSheets();
    
    // Get current headers
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'ACCESS_CONTRO!A1:Z1',
    });
    
    const currentHeaders = response.data.values?.[0] || [];
    console.log('[SHEETS] Current headers:', currentHeaders);
    
    // Define new headers
    const newHeaders = [
      'phone_number',
      'name', 
      'access_mode',
      'status',
      'can_view_sales',
      'can_view_expenses',
      'can_view_pending',
      'can_view_ledger',
      'can_view_products',
      'can_view_delegation',
      'can_view_checklist'
    ];
    
    // Update headers if needed
    if (currentHeaders.length < newHeaders.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: 'ACCESS_CONTRO!A1:K1',
        valueInputOption: 'RAW',
        resource: { values: [newHeaders] }
      });
      console.log('[SHEETS] Headers updated!');
    }
    
    // Add data validation (dropdowns)
    const requests = [
      // access_mode dropdown (Column C)
      {
        setDataValidation: {
          range: {
            sheetId: parseInt(ACCESS_CONTROL_GID),
            startRowIndex: 1,
            endRowIndex: 1000,
            startColumnIndex: 2,
            endColumnIndex: 3
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'ALL' },
                { userEnteredValue: 'LIMITED' },
                { userEnteredValue: 'BLOCKED' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // status dropdown (Column D)
      {
        setDataValidation: {
          range: {
            sheetId: parseInt(ACCESS_CONTROL_GID),
            startRowIndex: 1,
            endRowIndex: 1000,
            startColumnIndex: 3,
            endColumnIndex: 4
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'active' },
                { userEnteredValue: 'blocked' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      },
      // YES/NO dropdowns for permissions (Columns E-K)
      {
        setDataValidation: {
          range: {
            sheetId: parseInt(ACCESS_CONTROL_GID),
            startRowIndex: 1,
            endRowIndex: 1000,
            startColumnIndex: 4,
            endColumnIndex: 11
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'YES' },
                { userEnteredValue: 'NO' }
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      }
    ];
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests }
    });
    
    console.log('[SHEETS] Dropdowns added!');
    return { success: true };
    
  } catch (e) {
    console.error('[SHEETS] Setup error:', e.message);
    return { success: false, error: e.message };
  }
}

// Add new user to sheet
async function addUserToSheet(phone, name, accessMode = 'LIMITED', status = 'active', permissions = {}) {
  try {
    const sheets = await getSheets();
    
    const row = [
      phone,
      name,
      accessMode,
      status,
      permissions.can_view_sales || 'YES',
      permissions.can_view_expenses || 'YES',
      permissions.can_view_pending || 'YES',
      permissions.can_view_ledger || 'NO',
      permissions.can_view_products || 'YES',
      permissions.can_view_delegation || 'YES',
      permissions.can_view_checklist || 'YES'
    ];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'ACCESS_CONTRO!A:K',
      valueInputOption: 'RAW',
      resource: { values: [row] }
    });
    
    console.log('[SHEETS] User added:', phone);
    return { success: true };
    
  } catch (e) {
    console.error('[SHEETS] Add user error:', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { setupAccessControlColumns, addUserToSheet };
