@IsTest
private class AddInContentDocumentServiceTest {

    @IsTest
    static void testCreateContentDocumentWithoutLink() {
        String base64Data = EncodingUtil.base64Encode(Blob.valueOf('test file content'));
        String fileName = 'TestDocument.pdf';

        Test.startTest();
        Map<String, String> result = AddInContentDocumentService.createContentDocument(
            base64Data, fileName, null
        );
        Test.stopTest();

        System.assertNotEquals(null, result.get('contentDocumentId'), 'ContentDocumentId should be returned');
        System.assertNotEquals(null, result.get('contentVersionId'), 'ContentVersionId should be returned');
        System.assertEquals(null, result.get('contentDocumentLinkId'), 'No link should be created');

        ContentVersion cv = [
            SELECT Title, PathOnClient
            FROM ContentVersion
            WHERE Id = :result.get('contentVersionId')
        ];
        System.assertEquals(fileName, cv.Title);
        System.assertEquals(fileName, cv.PathOnClient);
    }

    @IsTest
    static void testCreateContentDocumentWithLink() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        String base64Data = EncodingUtil.base64Encode(Blob.valueOf('test file content'));
        String fileName = 'LinkedDocument.pdf';

        Test.startTest();
        Map<String, String> result = AddInContentDocumentService.createContentDocument(
            base64Data, fileName, acc.Id
        );
        Test.stopTest();

        System.assertNotEquals(null, result.get('contentDocumentId'), 'ContentDocumentId should be returned');
        System.assertNotEquals(null, result.get('contentVersionId'), 'ContentVersionId should be returned');
        System.assertNotEquals(null, result.get('contentDocumentLinkId'), 'ContentDocumentLinkId should be returned');

        ContentDocumentLink cdl = [
            SELECT LinkedEntityId, ShareType, Visibility
            FROM ContentDocumentLink
            WHERE Id = :result.get('contentDocumentLinkId')
        ];
        System.assertEquals(acc.Id, cdl.LinkedEntityId);
        System.assertEquals('V', cdl.ShareType);
        System.assertEquals('AllUsers', cdl.Visibility);
    }

    @IsTest
    static void testCreateContentDocumentWithBlankRecordId() {
        String base64Data = EncodingUtil.base64Encode(Blob.valueOf('test'));

        Test.startTest();
        Map<String, String> result = AddInContentDocumentService.createContentDocument(
            base64Data, 'BlankId.txt', ''
        );
        Test.stopTest();

        System.assertNotEquals(null, result.get('contentDocumentId'));
        System.assertEquals(null, result.get('contentDocumentLinkId'), 'No link for blank recordId');
    }
}
