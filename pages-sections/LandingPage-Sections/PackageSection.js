import React from "react";
// nodejs library that concatenates classes
import classNames from "classnames";
// @material-ui/core components
import { makeStyles } from "@material-ui/core/styles";

// @material-ui/icons

// core components
import GridContainer from "../../src/components/Grid/GridContainer.js";
import GridItem from "../../src/components/Grid/GridItem.js";
import Button from "../../src/components/CustomButtons/Button.js";
import Card from "../../src/components/Card/Card.js";
import CardBody from "../../src/components/Card/CardBody.js";
import CardFooter from "../../src/components/Card/CardFooter.js";

import styles from "../../assets/jss/nextjs-material-kit/pages/landingPageSections/packageStyle.js";


const useStyles = makeStyles(styles);

export default function PackageSection() {
  const classes = useStyles();
  const imageClasses = classNames(
    classes.imgRaised,
    classes.imgRoundedCircle,
    classes.imgFluid
  );
  return (
    <div className={classes.section}>
      <h2 className={classes.title}>R packages that are part of the SportsDataverse:</h2>
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={8} className={classes.itemGrid}>
                <img src={`images/cfbfastR-logo.png`} alt="cfbfastR" />
              </GridItem>
              <h4 className={classes.cardTitle}>
                cfbfastR
                <br />
                <small className={classes.smallTitle}>College Football - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                cfbfastR is an R package for working with College Football data.
                </p>
                <p className={classes.description}>
                It is an R API wrapper around https://collegefootballdata.com/.
                </p>
                <p className={classes.description}>
                It provides users the capability to retrieve data from the API and supplement that data with
                Expected Points Added/Win Probability added metrics.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={8} className={classes.itemGrid}>
                <img src={`images/hoopR-logo.png`} alt="hoopR" />
              </GridItem>
              <h4 className={classes.cardTitle}>
                hoopR
                <br />
                <small className={classes.smallTitle}>Men's Basketball - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                hoopR is an R package for working with men's basketball data.
                Provides live game support for ESPN’s NBA and men's college basketball game data and NCAA NET Rankings.
                </p>
                <p className={classes.description}>
                Also performs as a scraping and aggregating interface for Ken Pomeroy’s college basketball statistics website, kenpom.com.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={8} className={classes.itemGrid}>
                <img src={`images/wehoop-logo.png`} alt="wehoop"  />
              </GridItem>
              <h4 className={classes.cardTitle}>
                wehoop
                <br />
                <small className={classes.smallTitle}>Women's Basketball - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                wehoop is an R package for working with WNBA and women's college basketball data.
                </p>
                <p className={classes.description}>
                Provides support for ESPN’s WNBA and women's college basketball game data and NCAA NET Rankings.
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
      {/* second row of packages */}
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={7} className={classes.itemGrid}>
                <img src={`images/cfbrecruitR-logo.png`} alt="cfbrecruitR"  />
              </GridItem>
              <h4 className={classes.cardTitle}>
                cfbrecruitR
                <br />
                <small className={classes.smallTitle}>College Football Recruiting - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                cfbrecruitR is an R package for working with college football recruiting data.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={11} className={classes.itemGrid}>
                <img src={`images/cfbfastR-data-repo.png`} alt="cfbfastR-data" />
              </GridItem>
              <h4 className={classes.cardTitle}>
                cfbfastR-data
                <br />
                <small className={classes.smallTitle}>College Football - Data</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                cfbfastR-data is a repository for working with CFB data. 2002-2020 data included in csv, rds, and parquet format.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={9} className={classes.itemGrid}>
                <img src={`images/hoopR_social_card_data_repo.png`} alt="hoopR-data" />
              </GridItem>
              <h4 className={classes.cardTitle}>
                hoopR-data
                <br />
                <small className={classes.smallTitle}>Men's Basketball - Data</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                hoopR-data contains data for most teams, players and coaches from 2002-2020. All data provided in csv, rds, and parquet format.
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={7} className={classes.itemGrid}>
                <img src={`images/wehoop_social_card_data_repo.png`} alt="wehoop-data"  />
              </GridItem>
              <h4 className={classes.cardTitle}>
              wehoop-data
                <br />
                <small className={classes.smallTitle}>Women's Basketball - Data</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                wehoop-data contains data for most teams and games from 2002-present. All data provided in csv, rds, and parquet format.
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
    </div>
  );
}
