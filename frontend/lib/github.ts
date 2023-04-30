import { GithubRepo } from "./types";

const tempData = {
  login: "saiemgilani",
  id: 25425933,
  node_id: "MDQ6VXNlcjU1NzEzNTA1",
  avatar_url: "https://avatars.githubusercontent.com/u/65556153?s=200&v=4",
  gravatar_id: "",
  url: "https://api.github.com/orgs/SportsDataverse",
  html_url: "https://github.com/SportsDataverse",
  followers_url: "https://api.github.com/users/saiemgilani/followers",
  following_url: "https://api.github.com/users/saiemgilani/following{/other_user}",
  gists_url: "https://api.github.com/users/saiemgilani/gists{/gist_id}",
  starred_url: "https://api.github.com/users/saiemgilani/starred{/owner}{/repo}",
  subscriptions_url: "https://api.github.com/users/saiemgilani/subscriptions",
  organizations_url: "https://api.github.com/users/saiemgilani/orgs",
  repos_url: "https://api.github.com/users/saiemgilani/repos",
  events_url: "https://api.github.com/users/saiemgilani/events{/privacy}",
  received_events_url: "https://api.github.com/users/saiemgilani/received_events",
  type: "User",
  site_admin: false,
  name: "Saiem Gilani",
  company: "SportsDataverse",
  blog: "saiemgilani.com",
  location: "Florida, USA",
  email: "saiem.gilani@gmail.com",
  hireable: true,
  bio: "Creator and Maintainer for the @sportsdataverse",
  twitter_username: "saiemgilani",
  public_repos: 66,
  public_gists: 8,
  followers: 173,
  following: 292,
  created_at: "2019-09-23T18:37:14Z",
  updated_at: "2022-07-02T03:07:58Z",
};

// its for /api/stats/github
export async function fetchGithub() {
  const fake = false;
  if (fake) return tempData;
  return fetch("https://api.github.com/orgs/SportsDataverse").then((res) => res.json());
}

// its for getting temporary old data
export function getOldStats() {
  return tempData;
}

/* Retrieves the number of stars and forks for the user's repositories on GitHub. */
export async function getGithubStarsAndForks() {
  // Fetch user's repositories from the GitHub API
  const res = await fetch(
    "https://api.github.com/orgs/SportsDataverse/repos?per_page=200"
  );
  const userRepos = await res.json();


  // filter those repos that are forked
  const mineRepos: GithubRepo[] = userRepos?.filter(
    (repo: GithubRepo) => !repo.fork
  );

  // Calculate the total number of stars for the user's repositories
  const githubStars = mineRepos.reduce(
    (accumulator: number, repository: GithubRepo) => {
      return accumulator + repository["stargazers_count"];
    },
    0
  );

  // Calculate the total number of forks for the user's repositories
  const forks = mineRepos.reduce(
    (accumulator: number, repository: GithubRepo) => {
      return accumulator + repository["forks_count"];
    },
    0
  );

  return { githubStars, forks };
}
