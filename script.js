const fs                = require("fs");
const readline          = require("readline");
const {google}          = require("googleapis");
const throttledQueue    = require("throttled-queue");
const throttle          = throttledQueue(5, 1000, true);
const csvOutput         = `./gdrive-output.csv`

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/drive.metadata.readonly"];
// The file token.json stores the user"s access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "token.json";

// Load client secrets from a local file.
fs.readFile("credentials.json", (err, content) => {
  if (err) return console.log("Error loading client secret file:", err);
  // Authorize a client with credentials, then call the Google Drive API.
  authorize(JSON.parse(content), workflow);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * The workflow of this script is as follows.
 * 1. The script will get a list of folders from Drive API
 * 2. Once the folders have been written to an array, the script will
 *      cycle through each folder, read the file names, mimeTypes, and
 *      ids and write the id to the proper drive URL.
 * 3. That data will be written to a JSON object that will converted
 *      to another file type
 */

/**
 * Get folder list
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client. 
 */
 
function workflow(auth) {
  // let outputPath = timeStampedFile()
  const drive = google.drive({version: "v3", auth});
  let folders = []
  console.log("initiating folder retrieval")
  folderGet(drive, "", folders)
}

// function timeStampedFile () {
//   let time = new Date().toISOString()
//   let stamp = "gdrive-output-" + time + ".csv"
//   return fs.writeFile(stamp)
// }


function folderGet (drive, nextPageToken, folderList) {
  drive.files.list({
        pageToken : nextPageToken,
        pageSize: 100, //Feel free to adjust this as you see fit depending on the quantity of items you"re dealing with
        fields: "nextPageToken, files(id, name, mimeType)",
        q: "mimeType = \"application/vnd.google-apps.folder\""
    }, (err, res) => {
      if (err) return console.log("The API returned an error: " + err);
        const token = res.data.nextPageToken;
        Array.prototype.push.apply(folderList, res.data.files);
        if (token) {
          folderGet(drive, token, folderList);
          console.log
          console.log("moving to next page")
      } else {
        console.log("Initating file parsing")
        fileParse(drive, folderList)
      }})
}


function fileParse(drive, folders) {
  folders.forEach(function(folder, index) {
    throttle(function() {
      const folderID = folder.id
      drive.files.list({
        pageSize: 100, //Feel free to adjust this as you see fit depending on the quantity of items you"re dealing with
        fields: "nextPageToken, files(id, name, mimeType)",
        q:  `"${folderID}" in parents`
      }, (err, res) => {
      if (err) return console.log("The API returned an error: " + err)
      const files = res.data.files
      console.log(index)
      if (files.length) {
          files.map((file) => {
              let url = ""
              let folder = "https://drive.google.com/drive/u/0/folders/" + folderID
              file.mimeType === "application/vnd.google-apps.document" ? url = "https://docs.google.com/document/d/" + file.id
              : file.mimeType === "application/vnd.google-apps.spreadsheet" ? url = "https://docs.google.com/spreadsheets/d/" + file.id
              : console.log("mime type not supported")
              url ? fs.appendFile(csvOutput, `${folder}, ${file.name}, ${url}, ${file.mimeType}\n`, function(err) { err ? console.log("Your error is " + err) : console.log("appending to csv")}) 
              : console.log("skipping file type")
            })
          console.log("Files parsed, moving to next folder")
      } else {
          console.log("No files found.")
      }
    })})
  })
}
