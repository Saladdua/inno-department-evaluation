import { google } from 'googleapis'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function getSheetValues(range: string): Promise<string[][]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range,
  })
  return (res.data.values ?? []) as string[][]
}

export async function writeSheetValues(range: string, values: string[][]): Promise<void> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

export interface SheetUser {
  sheetRowId: string
  name: string
  email: string
  role: 'super_admin' | 'leadership' | 'department'
  departmentName?: string
  password: string
}

// Parse the USER sheet — adjust column indices to match your actual sheet layout
export async function fetchUsersFromSheet(): Promise<SheetUser[]> {
  // Range covers the user sheet — skip header row
  const rows = await getSheetValues("'TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ  - USER'!A2:F1000")
  return rows
    .filter((row) => row[0] && row[2])
    .map((row, index) => ({
      sheetRowId: `row_${index + 2}`,
      name: row[0]?.trim() ?? '',
      email: row[1]?.trim() ?? '',
      password: row[2]?.trim() ?? '',
      role: (row[3]?.trim().toLowerCase() as SheetUser['role']) ?? 'department',
      departmentName: row[4]?.trim() || undefined,
    }))
}
