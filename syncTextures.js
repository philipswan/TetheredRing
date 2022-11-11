/** 
 * syncs textures from the server to local development environment
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const lodash = require('lodash/array');
const axios = require('axios'); 
// url to server-side script with updated image list (json)
const textureList = 'https://www.project-atlantis.com/wp-content/threejs-simulation/textures/getTextures.php';
// url to location of remote texture files
const textureSource = 'https://www.project-atlantis.com/wp-content/threejs-simulation/textures';
// local texture folder
const textureFolder = './textures';
// delay (milliseconds) between file download requests --- server overload prevention
const delay = '10';

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
 * creates any missing texture directories 
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
 * parses the list of remote textures to determine directory structure to create locally
 *
 * @param {array}  remoteList               // array with list of remote textures
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
 *
 * @param {string}  url     // url to remote file location
 * @param {string}  local   // local filename with full path
 * @param {string}  agent   // HTTPS agent
 *
 * @return {Promise} 
 */
async function downloadFile(url, local, agent) {
  let config = {
    responseType: 'stream',
    httpsAgent: agent,
  };

  await axios.get(url, config)
    .then(response => {
      response.data.pipe(fs.createWriteStream(local));
      console.log('Downloading ' + url);
    })
    .catch(function (error) {
      console.log(error.toJSON());
    })
    .then(function () {
      agent.destroy()
    });
}



/**
 * determines missing files and iterates them through downloadFile
 *
 * @async
 *
 * @return {Promise}   
 */
async function syncTextures() {
  const remoteDirs = await getRemoteDirectoryTree()
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
      maxSockets: 1,
      maxTotalSockets: 1,
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

syncTextures()
