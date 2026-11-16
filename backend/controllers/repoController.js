const mongoose = require("mongoose");
const Repository = require("../models/repoModel");
const User = require("../models/userModel");
const Issue = require("../models/issueModel");
const vectorStore = require("../services/vectorStore");
const { indexRepository } = require("../services/repoIndexer");

/**
 * Creates a new repository in the database
 */
/**
 * Creates a new repository in the database
 */
async function createRepository(req, res) {
  const { owner, name, issues, content, description, visibility } = req.body;

  try {
    if (!name) {
      return res.status(400).json({ error: "Repository name is required!" });
    }

    if (!mongoose.Types.ObjectId.isValid(owner)) {
      return res.status(400).json({ error: "Invalid User ID!" });
    }

    // --- ADD THIS CHECK HERE ---
    // Check if this specific user already has a repo with this name
    const existingRepo = await Repository.findOne({ name: name, owner: owner });
    if (existingRepo) {
      return res.status(400).json({ error: "You already have a repository with this name!" });
    }
    // ---------------------------

    const newRepository = new Repository({
      name,
      description,
      visibility,
      owner,
      content,
      issues,
    });

    const result = await newRepository.save();

    res.status(201).json({
      message: "Repository created!",
      repositoryID: result._id,
    });
  } catch (err) {
    console.error("Error during repository creation : ", err.message);
    res.status(500).send("Server error");
  }
}

/**
 * Fetches all repositories (for explore/dashboard pages)
 */
async function getAllRepositories(req, res) {
  try {
    const repositories = await Repository.find({})
      .populate("owner")
      .populate("issues");

    if (repositories.length === 0) {
      return res.status(404).json({
        message: "No repositories found!",
      });
    }

    res.json({ repositories: repositories });
  } catch (err) {
    console.error("Error during fetching repositories : ", err.message);
    res.status(500).send("Server error");
  }
}

/**
 * Fetches a specific repository using its MongoDB ID
 */
async function fetchRepositoryById(req, res) {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid repository ID!" });
    }
    const repository = await Repository.findById(id)
      .populate("owner")
      .populate("issues");

    if (!repository) {
      return res.status(404).json({
        message: "Repository not found!",
      });
    }

    res.json({ repository });
  } catch (err) {
    console.error("Error during fetching repository : ", err.message);
    res.status(500).send("Server error");
  }
}

/**
 * Fetches a repository by its name
 */
async function fetchRepositoryByName(req, res) {
  const { name } = req.params;
  try {
    const repository = await Repository.findOne({ name })
      .populate("owner")
      .populate("issues");

    if (!repository) {
      return res.status(404).json({
        message: "Repository not found!",
      });
    }

    res.json({ repository });
  } catch (err) {
    console.error("Error during fetching repository : ", err.message);
    res.status(500).send("Server error");
  }
}

/**
 * Fetches all repositories belonging to a specific user ID
 */
async function fetchRepositoriesForCurrentUser(req, res) {
  console.log(req.params);
  const { userID } = req.params;

  try {
    const repositories = await Repository.find({ owner: userID });

    if (!repositories || repositories.length == 0) {
      return res.status(404).json({ error: "User Repositories not found!" });
    }
    console.log(repositories);
    res.json({ message: "Repositories found!", repositories });
  } catch (err) {
    console.error("Error during fetching user repositories : ", err.message);
    res.status(500).send("Server error");
  }
}

/**
 * Handles CLI pushes by updating repository content using username and repo name
 */
async function pushToRepo(req, res) {
  const { username, repoName } = req.params;
  const { content, description } = req.body;

  try {
    // 1. First, find the user by their username to get their exact MongoDB ObjectId
    const user = await User.findOne({ username: username });

    if (!user) {
      return res.status(404).json({ error: "User not found!" });
    }

    // 2. Find the repository that matches BOTH the repo name and the user's ObjectId
    const repository = await Repository.findOne({
      name: repoName,
      owner: user._id,
    });

    if (!repository) {
      return res.status(404).json({ error: "Repository not found!" });
    }

    // 3. Push the new commit metadata into the content array
    //    (skip commits that were already pushed before, so re-pushing is safe)
    const known = new Set(repository.content.map((c) => c.commitID));
    const fresh = (content || []).filter((c) => !known.has(c.commitID));
    repository.content.push(...fresh);

    if (description) {
      repository.description = description;
    }

    const updatedRepository = await repository.save();

    // Index the project for the chatbot in the background (SRS is optional).
    indexRepository(updatedRepository).catch((e) =>
      console.error("Indexing failed:", e.message),
    );

    res.json({
      message: "Repository updated successfully!",
      repository: updatedRepository,
    });
  } catch (err) {
    console.error("Error during pushing to repository : ", err.message);
    res.status(500).send("Server error");
  }
}

/**
 * Toggles the public/private visibility of a repository
 */
async function toggleVisibilityById(req, res) {
  const { id } = req.params;

  try {
    const repository = await Repository.findById(id);
    if (!repository) {
      return res.status(404).json({ error: "Repository not found!" });
    }

    repository.visibility = !repository.visibility;

    const updatedRepository = await repository.save();

    res.json({
      message: "Repository visibility toggled successfully!",
      repository: updatedRepository,
    });
  } catch (err) {
    console.error("Error during toggling visibility : ", err.message);
    res.status(500).send("Server error");
  }
}

/**
 * Deletes a repository permanently
 */
async function deleteRepositoryById(req, res) {
  const { id } = req.params;
  try {
    const repository = await Repository.findByIdAndDelete(id);
    if (!repository) {
      return res.status(404).json({ error: "Repository not found!" });
    }
    await vectorStore.deleteRepoData(id);

    res.json({ message: "Repository deleted successfully!" });
  } catch (err) {
    console.error("Error during deleting repository : ", err.message);
    res.status(500).send("Server error");
  }
}

module.exports = {
  createRepository,
  getAllRepositories,
  fetchRepositoryById,
  fetchRepositoryByName,
  fetchRepositoriesForCurrentUser,
  pushToRepo,
  toggleVisibilityById,
  deleteRepositoryById,
};
