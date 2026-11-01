const fs = require("fs").promises;
const path = require("path");

async function addRemote(url) {
  const repoPath = path.resolve(process.cwd(), ".gitMe");
  const configPath = path.join(repoPath, "config.json");

  try {
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData);

    // Save the URL exactly as the user pasted it
    config.remoteUrl = url;

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    console.log(`Remote added successfully: ${url}`);
  } catch (err) {
    console.error("Error adding remote. Make sure you run 'init' first.", err);
  }
}

module.exports = { addRemote };
