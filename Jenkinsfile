pipeline {
    agent any

    environment {
        PATH = "${env.PATH};C:\\Program Files\\k6"
        TEST_PROFILE = 'smoke'
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {
        stage('Checkout') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[url: 'https://github.com/aldopontoh/automationexercise-k6-api.git']]
                ])
            }
        }

        stage('Verify k6 & Clean Reports') {
            steps {
                bat '''
                    @echo off
                    k6 version
                    if exist reports rmdir /s /q reports
                    mkdir reports
                '''
            }
        }

        stage('Run k6 API Suite') {
            steps {
                bat '''
                    @echo off
                    k6 run -e TEST_PROFILE=%TEST_PROFILE% --summary-export=reports/summary.json scenarios/api-suite.js
                '''
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
        }
    }
}
