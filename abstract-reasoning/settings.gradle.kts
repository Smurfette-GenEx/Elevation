pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Robolectric's large Android runtime jar is fetched from Google's Maven Central mirror,
        // which is not rate limited like repo.maven.apache.org.
        exclusiveContent {
            forRepository { maven("https://maven-central.storage-download.googleapis.com/maven2") }
            filter { includeModule("org.robolectric", "android-all-instrumented") }
        }
    }
}

rootProject.name = "AbstractReasoning"

include(":app")
include(":puzzle")
