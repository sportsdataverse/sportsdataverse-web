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

import styles from '../../assets/jss/nextjs-material-kit/pages/landingPageSections/packageStyle.js';


const useStyles = makeStyles(styles);

export default function PythonPackageSection() {
  const classes = useStyles();
  const imageClasses = classNames(
    classes.imgRaised,
    classes.imgRoundedCircle,
    classes.imgFluid
  );
  return (
    <div className={classes.section}>
      <h2 className={classes.title}>Python packages in the SportsDataverse:</h2>
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={8} className={classes.itemGrid}>
              <Link href='https://cfbfastR-py.sportsdataverse.org/'>
                <Image
                src={`/images/cfbfastR-py-logo.png`} 
                alt='cfbfastR-py'
                width={209}
                height={250} />
              </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
                <Link href='https://cfbfastR-py.sportsdataverse.org/'>cfbfastR-py</Link>
                <br />
                <small className={classes.smallTitle}>College Football - Python</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://cfbfastR-py.sportsdataverse.org/'>cfbfastR-py</Link> is a Python package for working with College Football data.
                </p>
                <p className={classes.description}>
                It provides users the capability to load data from the <Link href='https://github.com/saiemgilani/cfbfastR-data/'>cfbfastR-data</Link> repository with
                Expected Points Added/Win Probability added metrics.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={8} className={classes.itemGrid}>
              <Link href='https://hoopR-py.sportsdataverse.org/'>
              <Image src={`/images/hoopR-py-logo.png`} alt='hoopR-py'
                width={209}
                height={250} /></Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
                <Link href='https://hoopR-py.sportsdataverse.org/'>hoopR-py</Link>
                <br />
                <small className={classes.smallTitle}>Men's Basketball - Python</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://hoopR-py.sportsdataverse.org/'>hoopR-py</Link> is a Python package for working with men's basketball data.
                Provides live game support for ESPN’s NBA and men's college basketball game data and NCAA NET Rankings.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={8} className={classes.itemGrid}>
              <Link href='https://wehoop-py.sportsdataverse.org/'>
                <Image
                  src={`/images/wehoop-py-logo.png`}
                  alt='wehoop-py'
                  width={209}
                  height={250} />
              </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
              <Link href='https://wehoop-py.sportsdataverse.org/'>wehoop-py</Link>
                <br />
                <small className={classes.smallTitle}>Women's Basketball - Python</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://wehoop-py.sportsdataverse.org/'>wehoop-py</Link> is a Python package for working with WNBA and women's college basketball data.
                </p>
                <p className={classes.description}>
                Provides support for ESPN’s WNBA and women's college basketball game data and NCAA NET Rankings.
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
    </div>
  );
}
