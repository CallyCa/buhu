import findVersions from "find-versions";
import githubBasic from "github-basic";
import githubFromPackage from "github-from-package";
import githubUrlToObject from "github-url-to-object";
import got from "got";
import pkg from "semver";
const { lt, maxSatisfying } = pkg;

import striptags from "striptags";

const messagePrefix = "Update to ";

function getVersionDirectoryIndex(data) {
  // Search all the semver strings on the text and get the highest
  // non-prerelease one
  return maxSatisfying(findVersions(striptags(data.toString())), "");
}

function getVersionGithub(data) {
  // Search all the semver strings on the text and get the highest
  // non-prerelease one
  return maxSatisfying(findVersions(striptags(data.toString())), "");
}

/**
 * Get latest version of Node.js
 */
function getVersionNode(data) {
  return JSON.parse(data)[0].version.slice(1);
}

export default function Buho(PKG, auth) {
  if (!(this instanceof Buho)) return new Buho(PKG, auth);

  function updateSha256(version) {
    return got(`${PKG.buho.url}/sha256sums.asc`)
      .then(function ({ body }) {
        return body
          .toString()
          .split("\n")
          .map(function (element) {
            return element.split(/\s+/);
          })
          .find(function ([, filename]) {
            return filename === `linux-${version}.tar.gz`;
          });
      })
      .then(function ([sha256]) {
        return sha256;
      });
  }

  const userRepo = githubUrlToObject(githubFromPackage(PKG));
  const user = userRepo.user;
  const repo = userRepo.repo;

  const options = {
    version: 3,
    auth: auth,
  };

  const client = githubBasic(options);

  /**
   * Check latest version
   */
  this.check = function (type, url) {
    switch (type) {
      case "DirectoryIndex":
        var getLatestVersion = getVersionDirectoryIndex;
        break;

      case "Github":
        var getLatestVersion = getVersionGithub;
        break;

      case "nodejs":
        var getLatestVersion = getVersionNode;
        break;

      default:
        throw 'Unnkown type "' + type + '"';
    }

    return got(url).then(function ({ body }) {
      const latest = getLatestVersion(body);

      if (lt(PKG.version, latest)) return latest;
    });
  };

  /**
   * Update version of `package.json` and create a pull-request
   */
  this.update = async function (version) {
    PKG.version = version;

    const { buho: { sha256 } = {} } = PKG;
    if (sha256) PKG.buho.sha256 = await updateSha256(version);

    const message = messagePrefix + version;
    const branch = message.split(" ").join("_");

    return client
      .branch(user, repo, "master", branch)
      .then(function () {
        const commit = {
          branch: branch,
          message: message,
          updates: [
            {
              path: "package.json",
              content: JSON.stringify(PKG, null, 2),
            },
          ],
        };

        return client.commit(user, repo, commit);
      })
      .then(function () {
        return client.pull(
          { user, repo, branch },
          { user, repo },
          { title: message }
        );
      });
  };

  /**
   * Merge the pull-request with the `master` branch and delete it
   */
  this.merge = function (branch) {
    return client.merge(user, repo, branch).then(function () {
      return client.deleteBranch(user, repo, branch);
    });
  };
}

Buho.messagePrefix = messagePrefix;
