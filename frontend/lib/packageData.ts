export async function fetchPackageData() {

    return fetch("https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-web/with-data/frontend/data/projects.json").then((res) => res.json());
  }
