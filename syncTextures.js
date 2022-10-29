/** syncs textures from the server to local development environment
 *  
 *  
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const lodash = require('lodash/array');
// url to server-side script with updated image list (json)
const textureList = 'https://www.project-atlantis.com/wp-content/threejs-simulation/textures/getTextures.php';
// url to location of remote texture files
const textureSource = 'https://www.project-atlantis.com/wp-content/threejs-simulation/textures';

/**
 * scans local textures
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
 * pulls list (json) of remote textures from the server
 * 
 * @async
 * @param {string}            url             // url to json output
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
 * downloads the file from the server
 *
 * @async
 * @param {string}  remoteFile  // url to remote file location
 * @param {string}  localFile   // local filename with full path
 *
 * @return {Promise<string>} remoteFile  // downloaded filename
 */
async function downloadFile(remoteFile, localFile) {
  return new Promise ((resolve, reject) => {
    let req = https.get(remoteFile, (res) => {
      const download = fs.createWriteStream(localFile);
      res.pipe(download);
      res.unpipe(download);
    });

    req.on('response', res => {
      resolve(remoteFile);
    });

    req.on('error', err => {
      reject(err);
    });

    req.end();
  });
}

/**
 * determines missing files and iterates them through downloadFile
 *
 * @async
 *
 * @return {string}   
 */
async function syncTextures() {
  const remoteTextures = await getRemoteTextures(textureList);
  const localTextures = getLocalTextures('./textures');
  const localTexturePath = path.join(__dirname, 'textures', '/');
  const diff = lodash.difference(remoteTextures, localTextures);
  if (!Array.isArray(diff)) {
    return Promise.reject('Error! diff is not an array!');
  } else if (Array.isArray(diff) && diff.length) {
    await Promise.all(diff.map( async file => {
      let localFile = path.join(localTexturePath, file);
      let remoteFile = textureSource + file;
      let finishedFile = await downloadFile(remoteFile, localFile, localTexturePath);
      console.log('Downloaded ' + finishedFile);
      Promise.resolve(finishedFile);
    }));
    console.log('Files Synced.');
    return Promise.resolve('updated');
  } else {
    console.log('Up to date!');
    return Promise.resolve('no-update');
  }
}


syncTextures();
