import {
  SiVisualstudiocode,
  SiRstudio,
  SiMicrosoftedge,
  SiGooglechrome,
  SiVercel,
  SiPrettier,
  SiPnpm,
  SiYarn,
  SiFigma,
  SiInsomnia,
  SiBitwarden,
  SiSpotify,
  SiObsstudio,
  SiGrammarly,
  SiCanva,
  SiGooglekeep,
  SiNotepadplusplus,
  SiPostman,
} from "react-icons/si";
import {
  BsFillPaletteFill,
  BsFillTerminalFill,
  BsWindows,
  BsGithub,
} from "react-icons/bs";
import { FaGitAlt, FaSearch } from "react-icons/fa";
import SVG from "@components/SVG";
import { Utilities } from "@lib/types";

const utilities: Utilities = {
  title: "Utilities",
  description:
    "In case you are wondering What tech I use, Here's the list of what tech I'm currently using for coding on the daily basis. This list is always changing.",
  lastUpdate: "April 27, 2023",
  data: [
    {
      title: "System",
      data: [
        {
          name: "VSCode",
          description: "Primary Code editor",
          Icon: SiVisualstudiocode,
          link: "https://code.visualstudio.com/download",
        },
        {
          name: "RStudio",
          description: "Text editor",
          Icon: SiRstudio,
          link: "https://posit.co/download/rstudio-desktop/",
        },
        {
          name: "Oh-my-zsh",
          description: "Terminal Theme",
          Icon: BsFillTerminalFill,
          link: "https://ohmyz.sh/",
        },
        {
          name: "Windows 11",
          description: "Operating System",
          Icon: BsWindows,
          link: "https://www.microsoft.com/software-download/windows11",
        },
        {
          name: "Chrome",
          description: "Primary Browser",
          Icon: SiGooglechrome,
          link: "https://www.google.com/chrome",
        },
      ],
    },

    {
      title: "Software & Applications",
      data: [
        {
          name: "Vercel",
          description: "Hosting for Projects",
          Icon: SiVercel,
          link: "http://vercel.com/",
        },
        {
          name: "Prettier",
          description: "For Code formatting",
          Icon: SiPrettier,
          link: "https://prettier.io/",
        },
        {
          name: "Git",
          description: "Version Control",
          Icon: FaGitAlt,
          link: "https://git-scm.com/downloads",
        },
        {
          name: "Github Desktop",
          description: "To Manage the Github Project and Changes",
          Icon: BsGithub,
          link: "https://desktop.github.com/",
        },
        {
          name: "yarn",
          description: "Alternative Package Manager",
          Icon: SiYarn,
          link: "https://classic.yarnpkg.com/lang/en/docs/install/",
        },
        {
          name: "OBS Studio",
          description: "Screen Recorder",
          Icon: SiObsstudio,
          link: "https://obsproject.com/",
        },
        {
          name: "Grammarly",
          description: "Typing assistant that reviews spelling, grammar, etc.",
          Icon: SiGrammarly,
          link: "https://www.grammarly.com/",
        },
        {
          name: "ShareX",
          description:
            "To capture or record and share it with a single press of a ke",
          Icon: SVG.ShareX,
          link: "https://getsharex.com/downloads/",
        },
        {
          name: "Raindrop.io",
          description: "Bookmark Manager",
          Icon: SVG.RainDrop,
          link: "https://raindrop.io/",
        },
        {
          name: "Google Keep",
          description: "Quick Note",
          Icon: SiGooglekeep,
          link: "https://keep.google.com/",
        },
        {
          name: "7-Zip",
          description: "File Archiver",
          Icon: SVG.Zip7,
          link: "https://www.7-zip.org/download.html",
        },
        {
          name: "Flameshot",
          description: "Screenshot Software",
          Icon: SVG.Flameshot,
          link: "https://flameshot.org/",
        },
      ],
    },
  ],
};

export default utilities;
