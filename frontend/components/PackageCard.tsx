import Image from 'next/image'
import Link from 'next/link'
import { Github, FileText, Database } from 'lucide-react'
import { Card, CardContent } from '@components/ui/card'

export default function PackageCard({ pkg }: { pkg: any }) {
  return (
    <Card className="h-full bg-white dark:bg-darkSecondary dark:text-gray-100">
      <CardContent className="flex flex-col gap-2 p-5">
        <h3 className="font-barlow text-center text-3xl leading-snug">
          {pkg.repoType == 'R' ? `{${pkg.title}}` : pkg.title}
        </h3>
        {pkg.logoHref ? (
          <div className="flex justify-center">
            <Link href={pkg.docsHref} passHref>
              <Image src={pkg.logoHref} alt={pkg.title} width={150} height={174} />
            </Link>
          </div>
        ) : null}
        <div className="flex items-center justify-center gap-2 text-gray-900 dark:text-gray-100">
          {pkg.sourceHref ? (
            <Link href={pkg.sourceHref} aria-label="Source code" passHref>
              <Github className="h-6 w-6" />
            </Link>
          ) : null}
          {pkg.docsHref ? (
            <Link href={pkg.docsHref} aria-label="Documentation" passHref>
              <FileText className="h-6 w-6" />
            </Link>
          ) : null}
          {pkg.dataRepoHref ? (
            <Link href={pkg.dataRepoHref} aria-label="Data repository" passHref>
              <Database className="h-6 w-6" />
            </Link>
          ) : null}
        </div>
        <p className="font-inter text-center font-medium">
          {pkg.repoType ? `${pkg.sports} - ${pkg.repoType}` : ''}
        </p>
        <p className="font-inter mx-auto max-w-2xl font-medium">{pkg.content}</p>
      </CardContent>
    </Card>
  )
}
