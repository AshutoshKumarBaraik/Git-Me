const fs= require("fs").promises;
const path = require("path");

async function initRepo(){
    const repoPath = path.resolve(process.cwd(),".gitMe");
    const commitsPath = path.join(repoPath,"commits");

    try{
        await fs.mkdir(repoPath,{recursive:true});
        await fs.mkdir(commitsPath,{recursive:true});
        await fs.writeFile(
            path.join(repoPath,"config.json"),
            JSON.stringify({bucket: process.env.S3_BUCKET})
        );
        console.timeLog("Repository Initialized!");
    }catch(err){
        console.error("Error initialising Repository",err);
    }
}

module.exports = { initRepo };