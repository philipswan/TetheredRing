/** 
 * syncTexture.js
 *
 * This script is designed to sync texture files and folders from a remote
 * server to the local development environement.
 *
 * Given the URL to a JSON file list (textureList), it will compare this list
 * with local files in the specified folder (textureFolder).  Upon determining
 * if any files are missing locally, it will iterate through the missing file
 * list and download any missing files from the remote location (textureSource)
 *
 * TODO: Check for file changes other than filename (such as updating an image)  
 * It currently only compares missing filenames.
 *
 */


/* Modules */
const fs = require('fs');
const path = require('path');
const https = require('https');
const lodash = require('lodash/array');
const axios = require('axios'); 

/* Global Variables */
// URL to the list of texture files on the remote server - expects JSON data
const textureList = 'https://www.project-atlantis.com/wp-content/threejs-simulation/textures/getTextures.php';
// URL to the location (directory) of the texture files on the remote server
const textureSource = 'https://www.project-atlantis.com/wp-content/threejs-simulation/textures';
// local texture folder (where files are downloaded)
const textureFolder = './textures';
// delay (milliseconds) between file download requests
const delay = '10';

/**
 * Warns the user if they are running an older version of NodeJS
 * Only checks major version
 *
 */
function checkNodeVersion() {
  const minNode = '19.0.1';
  const minNPM = '9.1.1';
  const installed = process.versions.node;

  if (installed.split('.'[0]) < minNode.split('.'[0])) {
    console.log(`Warning: This script was verified to work with version ${minNode} of NodeJS and ${minNPM} of NPM - you are on an earlier version. Please update NodeJS to version ${minNode} or later if you are experiencing issues.\n`);
  }
}

/**
 * Iterates through all files in the localPath merging them into a single
 * array to be compared with the remote files
 *
 * @param {string}  localPath   // path to local textures
 * @param {array}   fileArray   // callback to merge textures into single array
 *
 * @return {array}  fileArray   // list of local textures
 */
function getLocalTextures(localPath, fileArray) {
  files = fs.readdirSync(localPath);
  fileArray = fileArray || []

  files.forEach(function(file) {
    if (fs.statSync(localPath + "/" + file).isDirectory()) {
      fileArray = getLocalTextures(localPath + "/" + file, fileArray)
    } else {
      fileArray.push(path.join(localPath, "/", file))
    }
  })

  fileArray.forEach((element, index) => {
    fileArray[index] = element.replace(/^textures/, "");
  });

  return fileArray;
}

/**
 * Given a valid URL to JSON data, this function will download the data to 
 * a local variable and return it for use in the script 
 * 
 * @async
 * @param {string}            url             // path or url to json output
 *
 * @return {Promsie<array>}   remoteTextures  // list of remote textures
 */
async function getRemoteTextures(url) {
  if (url) {
    return new Promise ((resolve, reject) => {
      let req = https.get(url,(res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          try {
            let remoteTextures = JSON.parse(body);
            resolve(remoteTextures);
          } catch (error) {
            console.error(error.message);
          };
        });

      }).on("error", (error) => {
        reject(error)
      });
     
      req.end();
    });
  } else {
    reject('No URL specified!');
  }
}

/**
 * Using the list of remote files to be downloaded, an array is generated with a
 * list of directory names on the remote server.
 *
 * @param {array}  remoteList               // array with list of remote texture files
 *
 * @return {Promise<array>} directoryTree   // array containing folders to verify exist
 */
async function getRemoteDirectoryTree() {
  let remoteList = await getRemoteTextures(textureList);
  let directoryTree = [];
  let dir;
  if (remoteList) {
    remoteList.forEach( (texture) => {
      dir = texture.replace(/[^/]*$/, '');
      directoryTree.push(dir);
    });
    directoryTree = [... new Set(directoryTree)];
    return directoryTree;
  }
}

/**
 * Given a list of directories to check, this verifies that they exist locally
 * creating any missing directories.
 *
 * @param {array} dirList   // list of directories to verify
 */
function verifyTextureFolders(dirList) {
  try {
    if (!fs.existsSync(textureFolder)) {
      fs.mkdirSync(textureFolder);
      console.log('Created ' + textureFolder);
    }
  } catch (err) {
    console.error(err);
  }
  
  dirList.forEach( (dir) => {
    dir = path.join(__dirname, textureFolder, dir);
    try {
      if(!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log('Created ' + dir);
      }
    } catch (err) {
      console.log(err);
    }
  })
}

/**
 * This function is responsible for the actual file transfer.  It is given a
 * url to the remote file to be downloaded and the local location in which it
 * will be saved.
 *
 * HTTPS agent is to help with connection control to the server and eliminate
 * multiple connections/sockets causing server overloads/timeouts.
 *
 * @async
 *
 * @param {string}  url     // url to remote file location
 * @param {string}  local   // local filename with full path
 * @param {string}  agent   // HTTPS agent
 *
 * @return {Promise} 
 */
async function downloadFile(url, local, agent) {
  const writer = fs.createWriteStream(local);

  let config = {
    responseType: 'stream',
    httpsAgent: agent,
  };

  return axios.get(url, config)
  .then(response => {
    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      console.log('Downloading ' + url);
      let error;
      writer.on('error', err => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) {
          resolve(true);
        }
      });
    });
  });
}


/**
 * The main function to handle comparing the file lists and iterate through the 
 * list of files to be downloaded.
 *
 * Starts by calling functions to determine remote directory tree and files.
 * Then compares this with the local directory tree and files.
 * Determines the missing files (diff) required.
 * Loops each missing file through the download function.
 *
 * There is a delay added to the promise chain that can be specified globally.  
 * This delay is the time between requesting files to download.  This helps 
 * keep the server from blocking requests.
 *
 * @async
 *
 * @return {Promise}   
 */
async function syncTextures() {
  const remoteDirs = await getRemoteDirectoryTree();
  verifyTextureFolders(remoteDirs);
  const remoteTextures = await getRemoteTextures(textureList);
  const localTextures = getLocalTextures(textureFolder);
  const localTexturePath = path.join(__dirname, 'textures', '/');  // use textureFolder variable
  const diff = lodash.difference(remoteTextures, localTextures);

  if (!Array.isArray(diff)) {
    return Promise.reject('Error! diff is not an array!');
  } else if (Array.isArray(diff) && diff.length) {
    const agent = new https.Agent({ 
      keepAlive: true,
      rejectUnauthorized: false
    });

    let downloadLoop = function() {
      return new Promise(function (outerResolve) {
        let promise = Promise.resolve();
        let i = 0;
        let next = async function() {
          let file = diff[i];
          let localFile = path.join(localTexturePath, file);
          let remoteFile = textureSource + file;
          await downloadFile(remoteFile, localFile, agent);
          if (++i < diff.length) {
            promise = promise.then(function () {
              return new Promise(function (resolve) {
                setTimeout(function () {
                  resolve();
                  next();
                }, delay);
              });
            });
          } else {
            outerResolve();
          }
        };
        next();
      });
    };

    downloadLoop().then(function() {
      agent.destroy();
      console.log('Sync Complete!');
      return Promise.resolve();
    });

  } else {
    console.log('No Sync Required.');
    return Promise.resolve();
  }
}

checkNodeVersion()
syncTextures()
