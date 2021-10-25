DIST_FOLDER = dist
BUNDLE_NAME = pb-chorus-migration.tar.gz

bundle: echo_start create_dir copy_files copy_env compress_bundle clean_dist
	@echo "Done!"

bundle_no_env: echo_start_no_env create_dir copy_files compress_bundle clean_dist
	@echo "Done!"

echo_start:
	@echo "Creating dist bundle..."

echo_start_no_env:
	@echo "Creating dist bundle without env config..."

create_dir:
	mkdir ${DIST_FOLDER}

copy_files:
	cp *.js package.json package-lock.json ${DIST_FOLDER}/

copy_env:
	cp .env ${DIST_FOLDER}/

compress_bundle:
	tar -zcvf ${BUNDLE_NAME} ${DIST_FOLDER}/

clean: clean_dist clean_bundle
	@echo "Cleaned up"

clean_dist:
	rm -rf dist

clean_bundle:
	rm ${BUNDLE_NAME}
