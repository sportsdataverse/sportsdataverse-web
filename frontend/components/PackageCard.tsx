import Image from 'next/image'
import Link from 'next/link'
import GitHubIcon from '@mui/icons-material/GitHub'
import DescriptionIcon from '@mui/icons-material/Description'
import StorageIcon from '@mui/icons-material/Storage'

export default function PackageCard({ pkg }: { pkg: any}) {

  return (
    <>
      {pkg.repoType == 'R' ?
        <h3 className=" font-barlow text-center text-3xl mb-3 leading-snug">
          {`{`+pkg.title+`}`}
        </h3> :
        <h3 className=" font-barlow text-center text-3xl mb-3 leading-snug">
          {pkg.title}
        </h3>
      }
      {pkg.logoHref ? (
              <div
              style={{
                display: "flex",
                justifyContent: "center",
              }}
            >
        <Link href={pkg.docsHref} passHref>
          <Image src={pkg.logoHref} alt={pkg.title} width={"150"} height={"174"}/>
        </Link>
        </div>
      ) : (
        ''
      )}
      <div className="text-center text-gray-900 dark:text-gray-100 ">
        {pkg.sourceHref ? (
          <Link href={pkg.sourceHref} className="text-center text-gray-900 dark:text-gray-100 " passHref>
            <GitHubIcon />
          </Link>
        ) : (
          ''
        )}
        {pkg.docsHref ? (
          <Link href={pkg.docsHref} className="text-center text-gray-900 dark:text-gray-100 " passHref>
            <DescriptionIcon />
          </Link>
        ) : (
          ''
        )}
        {pkg.dataRepoHref ? (
          <Link href={pkg.dataRepoHref} className="text-center text-gray-900 dark:text-gray-100 " passHref>
            <StorageIcon />
          </Link>
        ) : (
          ''
        )}
      </div>
      <p className="font-medium font-inter text-center">{pkg.repoType ? `${pkg.sports}` + ' - ' + `${pkg.repoType}` : ''}</p>
      <p className="font-medium font-inter max-w-2xl mx-auto">{pkg.content}</p>
      <br />
    </>
  )
}
