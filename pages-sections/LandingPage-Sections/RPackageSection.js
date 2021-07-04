import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames';
import Link from 'next/link'
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';

// @material-ui/icons

// core components
import GridContainer from '../../src/components/Grid/GridContainer.js';
import GridItem from '../../src/components/Grid/GridItem.js';
import Button from '../../src/components/CustomButtons/Button.js';
import Card from '../../src/components/Card/Card.js';
import CardBody from '../../src/components/Card/CardBody.js';
import CardFooter from '../../src/components/Card/CardFooter.js';
import Image from 'next/image'
import wehoop from '../../public/images/wehoop-logo.png'
import hoopR from '../../public/images/hoopR-logo.png'
import cfbfastR from '../../public/images/cfbfastR-logo.png'
import recruitR from '../../public/images/recruitR-logo.png'
import styles from '../../assets/jss/nextjs-material-kit/pages/landingPageSections/packageStyle.js';


const useStyles = makeStyles(styles);

export default function RPackageSection() {
  const classes = useStyles();
  const imageClasses = classNames(
    classes.imgRaised,
    classes.imgRoundedCircle,
    classes.imgFluid
  );
  return (
    <div className={classes.section}>
      <h3 className={classes.title}>R packages in the SportsDataverse:</h3>
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={8} className={classes.itemGrid}>
              <Link href='https://saiemgilani.github.io/cfbfastR/'>
                <Image
                  src={cfbfastR}
                  alt='cfbfastR'/>
              </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
                <Link href='https://saiemgilani.github.io/cfbfastR/'>cfbfastR</Link>
                <br />
                <small className={classes.smallTitle}>College Football - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://saiemgilani.github.io/cfbfastR/'>cfbfastR</Link> is an R package for working with College Football data.
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
              <Link href='https://saiemgilani.github.io/hoopR/'>
                <Image
                    src={hoopR}
                    alt='hoopR' />
              </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
                <Link href='https://saiemgilani.github.io/hoopR/'>hoopR</Link>
                <br />
                <small className={classes.smallTitle}>Men's Basketball - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://saiemgilani.github.io/hoopR/'>hoopR</Link> is an R package for working with men's basketball data.
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
              <Link href='https://saiemgilani.github.io/wehoop/'>
              <Image
                    src={wehoop}
                    alt='wehoop' />
              </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
              <Link href='https://saiemgilani.github.io/wehoop/'>wehoop</Link>
                <br />
                <small className={classes.smallTitle}>Women's Basketball - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://saiemgilani.github.io/wehoop/'>wehoop</Link> is an R package for working with WNBA and women's college basketball data.
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
                <Link href='https://saiemgilani.github.io/recruitR/'>
                  <Image src={recruitR}
                    alt='recruitR' />
                </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
              <Link href='https://saiemgilani.github.io/recruitR/'>recruitR</Link>
                <br />
                <small className={classes.smallTitle}>College Sports Recruiting - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://saiemgilani.github.io/recruitR/'>recruitR</Link> is an R package for working with college sports recruiting data.
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
    </div>
  );
}
