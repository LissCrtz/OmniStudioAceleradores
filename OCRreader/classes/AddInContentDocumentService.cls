public with sharing class AddInContentDocumentService {

    @AuraEnabled
    public static Map<String, String> createContentDocument(String base64Data, String fileName, String recordId, String ocrText) {
        ContentVersion cv = new ContentVersion();
        cv.Title = fileName;
        cv.PathOnClient = fileName;
        cv.VersionData = EncodingUtil.base64Decode(base64Data);
        cv.IsMajorVersion = true;
        cv.text_OCR__c = ocrText;
        insert cv;

        ContentVersion insertedCv = [
            SELECT ContentDocumentId
            FROM ContentVersion
            WHERE Id = :cv.Id
            LIMIT 1
        ];

        Map<String, String> result = new Map<String, String>();
        result.put('contentDocumentId', insertedCv.ContentDocumentId);
        result.put('contentVersionId', String.valueOf(cv.Id));

        if (String.isNotBlank(recordId)) {
            ContentDocumentLink cdl = new ContentDocumentLink();
            cdl.ContentDocumentId = insertedCv.ContentDocumentId;
            cdl.LinkedEntityId = recordId;
            cdl.ShareType = 'V';
            cdl.Visibility = 'AllUsers';
            insert cdl;
            result.put('contentDocumentLinkId', String.valueOf(cdl.Id));
        }

        return result;
    }

    @AuraEnabled
    public static void deleteContentDocument(String contentDocumentId) {
        if (String.isBlank(contentDocumentId)) {
            throw new AuraHandledException('ContentDocumentId cannot be blank');
        }

        try {
            delete [SELECT Id FROM ContentDocument WHERE Id = :contentDocumentId LIMIT 1];
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting ContentDocument: ' + e.getMessage());
        }
    }
}
