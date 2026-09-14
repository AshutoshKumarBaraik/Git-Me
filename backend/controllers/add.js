const fs= require("fs").promises;
const path = require("path");

async function addRepo(filePath) {
    const repoPath = path.resolve(process.cwd(),".gitMe");
    const stagingPath = path.join(repoPath,"staging");

    try{
        await fs.mkdir(stagingPath, { recursive : true });
        const fileName = path.basename(filePath);//read the path provided by user
        await fs.copyFile(filePath,path.join(stagingPath,fileName));//creating a new file which is a copy of an existing file (we are not creating new file but now also modifying the file just creating a new file)
        console.log(`File ${fileName} added to the staging area!`);


    }catch(err){
        console.error("Error adding file : ",err);
    }
}

module.exports = { addRepo };