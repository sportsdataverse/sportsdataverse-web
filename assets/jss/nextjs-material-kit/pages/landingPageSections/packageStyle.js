import { cardTitle, title, smallTitle } from "../../../nextjs-material-kit.js";
import imagesStyle from "../../imagesStyles.js";

const packageStyle = {
  section: {
    padding: "10px 0",
    textAlign: "center"
  },
  title: {
    ...title,
    marginBottom: "1rem",
    marginTop: "5px",
    minHeight: "10px",
    textDecoration: "none",
    color: "inherit"
  },
  ...imagesStyle,
  itemGrid: {
    marginLeft: "auto",
    marginRight: "auto",
    color: "inherit"
  },
  cardTitle: {
    color: "inherit"
  },
  smallTitle: {
    color: "inherit",
    marginBottom: "1rem"
  },
  description: {
    color: "inherit",
    marginBottom: "1rem"
  },
  justifyCenter: {
    justifyContent: "center !important"
  },
  socials: {
    marginTop: "0",
    width: "100%",
    transform: "none",
    left: "0",
    top: "0",
    height: "100%",
    lineHeight: "10px",
    fontSize: "20px",
    color: "inherit"
  },
  margin5: {
    margin: "5px"
  }
};

export default packageStyle;
