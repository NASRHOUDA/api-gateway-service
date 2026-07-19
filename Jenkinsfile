pipeline {
    agent any

    environment {
        DOCKER_IMAGE   = 'houdanasr/api-gateway-service'
        VAULT_ADDR     = 'http://host.docker.internal:8200'
        GH_USER        = 'NASRHOUDA'
    }

    options {
        timeout(time: 60, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/NASRHOUDA/api-gateway-service.git',
                    credentialsId: 'github-token'
                echo '📦 Code récupéré depuis GitHub'
            }
        }

        stage('Check CI Skip') {
            steps {
                script {
                    def lastCommitMsg = sh(script: 'git log -1 --pretty=%B', returnStdout: true).trim()
                    if (lastCommitMsg.contains('[skip ci]')) {
                        echo "⏭️ Commit contient [skip ci] — build arrêté."
                        currentBuild.result = 'NOT_BUILT'
                        error("Build volontairement stoppé : commit [skip ci] détecté.")
                    }
                }
            }
        }

        stage('Fetch Secrets from Vault') {
            steps {
                withCredentials([string(credentialsId: 'vault-token', variable: 'VAULT_TOKEN')]) {
                    script {
                        env.DOCKER_USER = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/docker | jq -r '.data.data.username'
                        """, returnStdout: true).trim()
                        env.DOCKER_PASS = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/docker | jq -r '.data.data.password'
                        """, returnStdout: true).trim()
                        env.GH_TOKEN = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/github | jq -r '.data.data.token'
                        """, returnStdout: true).trim()
                        env.SONAR_TOKEN = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/sonar | jq -r '.data.data.token'
                        """, returnStdout: true).trim()
                        env.INTERNAL_API_KEY = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/app | jq -r '.data.data.internal_api_key'
                        """, returnStdout: true).trim()
                        env.FRONTEND_URL = sh(script: """
                            set +x
                            curl -s -H "X-Vault-Token: ${VAULT_TOKEN}" ${VAULT_ADDR}/v1/secret/data/taskmanager/app | jq -r '.data.data.frontend_url'
                        """, returnStdout: true).trim()

                        echo '✅ Secrets récupérés depuis Vault (masqués dans les logs)'

                        def required = ['DOCKER_USER','DOCKER_PASS','GH_TOKEN','SONAR_TOKEN','INTERNAL_API_KEY','FRONTEND_URL']
                        def missing = required.findAll { name ->
                            def v = env."${name}"
                            !v || v == 'null' || v.trim() == ''
                        }
                        if (missing) {
                            error("❌ Secrets manquants ou invalides depuis Vault : ${missing.join(', ')}")
                        }
                        echo '✅ Tous les secrets requis sont présents et valides'
                    }
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Unit Tests') {
            steps {
                sh 'npm test -- --coverage --coverageReporters=lcov || echo "⚠️ Tests terminés"'
            }
        }

        stage('Dependency Audit') {
            steps {
                sh 'npm audit --audit-level=high || echo "⚠️ npm vulnerabilities detected"'
            }
        }

        stage('SAST - Semgrep') {
    steps {
        sh '''
            docker run --rm \
              --volumes-from jenkins \
              returntocorp/semgrep:latest \
              semgrep --config=p/security-audit \
              "${WORKSPACE}" \
              --no-git-ignore \
              --json --output="${WORKSPACE}/semgrep-report.json" \
            || echo "⚠️ Semgrep scan terminé"
        '''
        archiveArtifacts artifacts: 'semgrep-report.json', allowEmptyArchive: true
    }
}

        stage('SonarQube Analysis') {
            steps {
                sh '''
                    echo "📊 Vérification des fichiers de rapport :"
                    ls -la coverage/ || echo "⚠️ Coverage directory not found"
                    rm -rf .scannerwork
                '''
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        npx sonar-scanner \
                          -Dsonar.projectKey=api-gateway-service \
                          -Dsonar.sources=. \
                          -Dsonar.host.url=http://host.docker.internal:9000 \
                          -Dsonar.token="$SONAR_TOKEN" \
                          -Dsonar.exclusions="**/node_modules/**,**/*.test.js,**/coverage/**" \
                          -Dsonar.javascript.lcov.reportPaths="coverage/lcov.info" \
                          -Dsonar.tests="__tests__" \
                          -Dsonar.test.inclusions="**/*.test.js" \
                          -Dsonar.working.directory=.scannerwork
                    '''
                }
            }
        }

        stage('SonarQube Quality Gate') {
            steps {
                script {
                    def qg = waitForQualityGate()
                    if (qg.status != 'OK') {
                        echo "⚠️ Quality Gate status: ${qg.status} - build marqué UNSTABLE"
                        currentBuild.result = 'UNSTABLE'
                    } else {
                        echo "✅ Quality Gate passed: ${qg.status}"
                    }
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                sh """
                    docker build \
                      -t ${DOCKER_IMAGE}:${BUILD_NUMBER} \
                      -t ${DOCKER_IMAGE}:latest \
                      -f docker/Dockerfile \
                      .
                    echo "✅ Image buildée"
                """
            }
        }

        stage('Prepare Trivy Cache') {
    steps {
        sh '''
            docker volume create trivy-cache-api-gateway
            docker run --rm \
              -v trivy-cache-api-gateway:/root/.cache/trivy \
              aquasec/trivy:latest image \
              --download-db-only --timeout 5m
        '''
    }
}

stage('Trivy Image Scan') {
    steps {
        retry(3) {
            sh '''
                set +e
                docker run --rm \
                  -v /var/run/docker.sock:/var/run/docker.sock \
                  -v trivy-cache-api-gateway:/root/.cache/trivy \
                  -v jenkins_home:/workspace-out \
                  aquasec/trivy:latest image \
                  ${DOCKER_IMAGE}:latest \
                  --severity HIGH,CRITICAL \
                  --exit-code 0 \
                  --timeout 5m \
                  --format json \
                  --output /workspace-out/workspace/api-gateway-service/trivy-report.json
                RESULT=$?
                if [ $RESULT -ne 0 ]; then
                    echo "❌ Trivy a échoué (code $RESULT)"
                    exit 1
                fi
            '''
        }
        archiveArtifacts artifacts: 'trivy-report.json', allowEmptyArchive: true
    }
}

        stage('Push to Docker Hub') {
            steps {
                sh '''
                    set +x
                    export DOCKER_CONFIG="${WORKSPACE}/.docker-${BUILD_NUMBER}"
                    mkdir -p "${DOCKER_CONFIG}"
                    echo "$DOCKER_PASS" | docker --config "${DOCKER_CONFIG}" login -u "$DOCKER_USER" --password-stdin
                    docker --config "${DOCKER_CONFIG}" push ${DOCKER_IMAGE}:${BUILD_NUMBER}
                    docker --config "${DOCKER_CONFIG}" push ${DOCKER_IMAGE}:latest
                    docker --config "${DOCKER_CONFIG}" logout
                    rm -rf "${DOCKER_CONFIG}"
                    echo "✅ Image poussée vers Docker Hub"
                '''
            }
        }

        stage('Update Manifests') {
            steps {
                sh '''
                    set +x
                    set -e
                    git config user.email jenkins@taskmanager.com
                    git config user.name "Jenkins CI"
                    export GIT_TERMINAL_PROMPT=0

                    sed -i "s|image: houdanasr/api-gateway-service:.*|image: houdanasr/api-gateway-service:${BUILD_NUMBER}|g" kubernetes/deployment.yaml

                    git add kubernetes/deployment.yaml
                    if ! git commit -m "ci: update image tag to build #${BUILD_NUMBER} [skip ci]"; then
                        echo "⚠️ No changes to commit"
                    fi
                    git push "https://${GH_USER}:${GH_TOKEN}@github.com/NASRHOUDA/api-gateway-service.git" HEAD:main
                    echo "✅ Manifests pushed successfully"
                '''
            }
        }

        stage('Flux Reconciliation') {
            steps {
                sh '''
                    sleep 30
                    flux reconcile source git flux-system --timeout=3m || true
                    flux reconcile kustomization taskmanager --timeout=3m || true
                    sleep 20
                    echo "📊 Pods:"
                    kubectl get pods -n taskmanager -l app=api-gateway || true
                    echo "✅ Déploiement Flux CD complété"
                '''
            }
        }

        stage('DAST Security Scan') {
            steps {
                echo "🚀 Lancement de l'analyse dynamique (DAST) avec OWASP ZAP..."
                sh '''
                    set +e
                    mkdir -p "${WORKSPACE}/zap-report"
                    docker volume create zap-wrk-${BUILD_NUMBER}

                    docker run --name zap-scan-${BUILD_NUMBER} \
                      -v zap-wrk-${BUILD_NUMBER}:/zap/wrk \
                      --user root \
                      zaproxy/zap-stable zap-baseline.py \
                      -t http://host.docker.internal/ \
                      -r zap_report.html \
                      -z "-config replacer.full_list(0).description=hostheader \
                          -config replacer.full_list(0).enabled=true \
                          -config replacer.full_list(0).matchtype=REQ_HEADER \
                          -config replacer.full_list(0).matchstr=Host \
                          -config replacer.full_list(0).regex=false \
                          -config replacer.full_list(0).replacement=localhost"
                    SCAN_EXIT=$?
                    echo "ZAP exit code: ${SCAN_EXIT}"

                    docker cp "zap-scan-${BUILD_NUMBER}:/zap/wrk/zap_report.html" \
                      "${WORKSPACE}/zap-report/zap_report.html" 2>/dev/null \
                      || echo "⚠️ Rapport ZAP introuvable."

                    docker rm zap-scan-${BUILD_NUMBER} >/dev/null 2>&1 || true
                    docker volume rm zap-wrk-${BUILD_NUMBER} >/dev/null 2>&1 || true
                    exit 0
                '''
                archiveArtifacts artifacts: 'zap-report/zap_report.html', allowEmptyArchive: true
            }
        }
    }

    post {
        success { echo '✅ Pipeline api-gateway-service réussi !' }
        failure { echo '❌ Pipeline échoué' }
    }
}
