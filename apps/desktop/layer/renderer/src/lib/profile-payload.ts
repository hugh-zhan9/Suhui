export type LocalProfileFormValues = {
  handle?: string
  name?: string
  image?: string
  bio?: string
  website?: string
  socialLinks?: Record<string, string | undefined>
}

export const toLocalProfileUpdatePayload = (values: LocalProfileFormValues) => ({
  name: values.name,
  image: values.image,
  bio: values.bio,
  website: values.website,
  socialLinks: values.socialLinks,
})
