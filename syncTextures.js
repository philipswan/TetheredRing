// syncs textures from the server to local development environment

const fs = require('fs');
const path = require('path');
const https = require('https');
const lodash = require('lodash/array');
// server-side script with updated image list, output in json
const url = 'https://www.project-atlantis.com/wp-content/threejs-simulation/textures/getTextures.php';
const textureSource = 'https://www.project-atlantis.com/wp-content/threejs-simulation/textures';

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

async function getRemoteTextures() {
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
}


async function syncTextures() {
  const remoteTextures = await getRemoteTextures();
  const localTextures = getLocalTextures('./textures');
  const localTexturePath = path.join(__dirname, 'textures', '/');
  const diff = lodash.difference(remoteTextures, localTextures);

  await Promise.all(diff.map( async file => {
    let localFile = path.join(localTexturePath, file);
    let remoteFile = textureSource + file;
    let finishedFile = await downloadFile(remoteFile, localFile, localTexturePath);
    console.log('Downloaded ' + finishedFile);
    Promise.resolve(finishedFile);
  }));

  console.log('Files Synced.');
  return Promise.resolve('synced');
}

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

syncTextures()

